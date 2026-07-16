"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useForm, Controller, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createProduct, updateProduct } from "@/actions/products";
import { createProductSchema, type CreateProductInput } from "@/lib/validation/product";
import type { ProductRow } from "@/app/(dashboard)/products/page";
import { ImageUploader } from "@/components/products/image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Option { id: string; name: string }

interface Props {
  categories: Option[];
  suppliers: Option[];
  product?: ProductRow;          // present = edit mode
  label?: ReactNode;             // trigger content (create mode)
  open?: boolean;                // controlled mode (edit from table)
  onOpenChange?: (open: boolean) => void;
}

/**
 * Create/Edit drawer (Sheet). One form for both modes:
 * the same Zod schema that the server action runs also powers
 * client-side errors — users never wait for a round-trip to see
 * "SKU is required", and the server still re-validates everything.
 */
export function ProductDrawerTrigger({ categories, suppliers, product, label, open, onOpenChange }: Props) {
  const isEdit = !!product;
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = controlled ? open : internalOpen;
  const setOpen = controlled ? onOpenChange! : setInternalOpen;
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: isEdit
      ? {
          name: product.name,
          sku: product.sku ?? "",
          barcode: product.barcode ?? "",
          categoryId: product.category?.id,
          supplierId: product.supplier?.id,
          buyingPrice: product.buyingPrice,
          sellingPrice: product.sellingPrice,
          quantity: product.quantity,
          minimumStock: product.minimumStock,
          status: product.status,
          allowLoss: product.buyingPrice > product.sellingPrice,
          images: product.images,
        }
      : {
          name: "", sku: "", barcode: "", buyingPrice: 0, sellingPrice: 0,
          quantity: 0, minimumStock: 0, status: "ACTIVE", allowLoss: false, images: [],
        },
    mode: "onTouched",
  });

  const errors = form.formState.errors;

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateProduct({ ...values, id: product.id })
        : await createProduct(values);

      if (result.success) {
        toast.success(isEdit ? "Product updated." : "Product created.");
        setOpen(false);
        if (!isEdit) form.reset();
      } else {
        // Server-side field errors (e.g. duplicate SKU) land on the right input
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as FieldPath<CreateProductInput>, {
  message: messages?.[0] ?? "Invalid value",
});
          }
        }
        toast.error(result.error);
      }
    });
  });

  const field = (id: FieldPath<CreateProductInput>, label_: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label_}</Label>
      <Input id={id} {...props} {...form.register(id)} aria-invalid={!!errors[id]} />
      {errors[id] && <p role="alert" className="text-xs text-destructive">{errors[id]?.message as string}</p>}
    </div>
  );

  return (
    <Sheet open={actualOpen} onOpenChange={setOpen}>
      {!controlled && (
        <SheetTrigger asChild>
          <Button>{label ?? "Add product"}</Button>
        </SheetTrigger>
      )}
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{isEdit ? `Edit ${product.name}` : "Add product"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Stock is adjusted separately so inventory history stays accurate." : "Fill in the details — images are optional."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 px-6 py-5">
            {/* Images */}
            <Controller
              control={form.control}
              name="images"
              render={({ field: f }) => <ImageUploader value={f.value} onChange={f.onChange} disabled={pending} />}
            />
            {errors.images && <p role="alert" className="text-xs text-destructive">{errors.images.message as string}</p>}

            {field("name", "Name", { placeholder: "e.g. USB-C cable 2m", autoFocus: !isEdit })}

            <div className="grid grid-cols-2 gap-4">
              {field("sku", "SKU", { placeholder: "CBL-USBC-2M" })}
              {field("barcode", "Barcode", { placeholder: "6111234567890" })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Controller control={form.control} name="categoryId" render={({ field: f }) => (
                  <Select value={f.value ?? ""} onValueChange={f.onChange}>
                    <SelectTrigger aria-label="Category"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Controller control={form.control} name="supplierId" render={({ field: f }) => (
                  <Select value={f.value ?? ""} onValueChange={f.onChange}>
                    <SelectTrigger aria-label="Supplier"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {field("buyingPrice", "Buying price", { type: "number", step: "0.01", min: "0" })}
              {field("sellingPrice", "Selling price", { type: "number", step: "0.01", min: "0" })}
            </div>

            {/* allowLoss — explicit opt-in for selling below cost */}
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <Label htmlFor="allowLoss">Allow selling at a loss</Label>
                <p className="text-xs text-muted-foreground">Needed only if the selling price is below cost.</p>
              </div>
              <Controller control={form.control} name="allowLoss" render={({ field: f }) => (
                <Switch id="allowLoss" checked={f.value} onCheckedChange={f.onChange} />
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {isEdit ? (
                <div className="space-y-1.5">
                  <Label>Stock</Label>
                  <Input value={product.quantity} disabled aria-label="Current stock (adjust via stock adjustment)" />
                  <p className="text-xs text-muted-foreground">Use “Adjust stock” to change.</p>
                </div>
              ) : (
                field("quantity", "Opening stock", { type: "number", min: "0" })
              )}
              {field("minimumStock", "Minimum stock", { type: "number", min: "0" })}
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller control={form.control} name="status" render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange}>
                  <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>

          <SheetFooter className="border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
