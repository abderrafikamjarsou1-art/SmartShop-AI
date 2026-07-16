"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Store, Globe2, ImageIcon, ArrowLeft, ArrowRight, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { createBusiness } from "@/actions/business";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  name: z.string().trim().min(1, "Give your shop a name.").max(100),
  currency: z.string().length(3),
  timezone: z.string().min(1),
  taxRate: z.coerce.number().min(0, "Can't be negative.").max(100, "Maximum is 100%."),
});
type FormValues = z.infer<typeof schema>;

const CURRENCIES = ["MAD", "USD", "EUR", "GBP", "SAR", "AED"];
const TIMEZONES = [
  "Africa/Casablanca", "Europe/Paris", "Europe/London",
  "America/New_York", "Asia/Dubai", "Asia/Riyadh",
];

const STEPS = [
  { icon: Store, title: "Your shop", description: "What should we call it?" },
  { icon: Globe2, title: "Localization", description: "Currency, timezone and tax." },
  { icon: ImageIcon, title: "Logo", description: "Optional — add it anytime later." },
];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 20 },
    mode: "onTouched",
  });

  const next = async () => {
    const fields: (keyof FormValues)[][] = [["name"], ["currency", "timezone", "taxRate"], []];
    const valid = await form.trigger(fields[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      let logoUrl: string | undefined;

      // Optional logo upload -> Supabase Storage "logos" bucket (public)
      if (logoFile) {
        const supabase = createClient();
        const path = `${crypto.randomUUID()}-${logoFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error } = await supabase.storage.from("logos").upload(path, logoFile);
        if (error) {
          toast.error("Logo upload failed — you can add it later in Settings.");
        } else {
          logoUrl = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
        }
      }

      const result = await createBusiness({ ...values, logoUrl });
      if (result.success) {
        toast.success(`${values.name} is ready!`);
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  });

  const StepIcon = STEPS[step].icon;

  return (
    <Card className="w-full max-w-lg shadow-lifted">
      <CardContent className="p-8">
        {/* Progress */}
        <div className="mb-8 flex items-center gap-2" role="progressbar"
          aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}
          aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300
              ${i <= step ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>

        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <StepIcon className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="display-tight text-lg font-semibold">{STEPS[step].title}</h1>
            <p className="text-sm text-muted-foreground">{STEPS[step].description}</p>
          </div>
        </div>

        <form onSubmit={submit}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-4"
            >
              {step === 0 && (
                <div className="space-y-2">
                  <Label htmlFor="name">Business name</Label>
                  <Input id="name" placeholder="e.g. Casa Phone Store" autoFocus {...form.register("name")} />
                  {form.formState.errors.name && (
                    <p role="alert" className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>
              )}

              {step === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={form.watch("currency")} onValueChange={(v) => form.setValue("currency", v)}>
                        <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="taxRate">Default tax rate (%)</Label>
                      <Input id="taxRate" type="number" step="0.01" min="0" max="100" {...form.register("taxRate")} />
                      {form.formState.errors.taxRate && (
                        <p role="alert" className="text-xs text-destructive">{form.formState.errors.taxRate.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select value={form.watch("timezone")} onValueChange={(v) => form.setValue("timezone", v)}>
                      <SelectTrigger aria-label="Timezone"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {step === 2 && (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/40">
                  <Upload className="size-5 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium">
                    {logoFile ? logoFile.name : "Upload your logo"}
                  </span>
                  <span className="text-xs text-muted-foreground">PNG or JPG, up to 2 MB — or skip this step</span>
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                    aria-label="Upload logo"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2 MB."); return; }
                      setLogoFile(f ?? null);
                    }}
                  />
                </label>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}
              className={step === 0 ? "invisible" : ""}>
              <ArrowLeft className="size-4" aria-hidden /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Continue <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : <>Create shop <Check className="size-4" aria-hidden /></>}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
