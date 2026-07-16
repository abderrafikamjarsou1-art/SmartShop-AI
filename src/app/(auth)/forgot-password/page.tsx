"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/actions/auth";
import type { ActionResult } from "@/lib/safe-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ActionResult<{ sent: true }> | null, FormData>(
    forgotPassword,
    null,
  );

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to set a new one.</CardDescription>
      </CardHeader>
      <CardContent>
        {state?.success ? (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@shop.ma" required />
            </div>
            {state && !state.success && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
