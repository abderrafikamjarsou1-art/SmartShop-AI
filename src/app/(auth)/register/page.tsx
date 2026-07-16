"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, testAction } from "@/actions/auth";
import type { ActionResult } from "@/lib/safe-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const [state, action, pending] = useActionState<ActionResult<{ needsVerification: boolean }> | null, FormData>(
    register,
    null,
  );

  if (state?.success) {
    return (
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>{state.data.needsVerification ? "Check your email" : "Account created"}</CardTitle>
          <CardDescription>
            {state.data.needsVerification
              ? "We sent you a verification link. Confirm your address, then sign in."
              : "Your account is ready."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={state.data.needsVerification ? "/login" : "/dashboard"}>
              {state.data.needsVerification ? "Back to sign in" : "Go to dashboard"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Start managing your shop in minutes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" autoComplete="name" placeholder="Amine Alaoui" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@shop.ma" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
          </div>
          {state && !state.success && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
