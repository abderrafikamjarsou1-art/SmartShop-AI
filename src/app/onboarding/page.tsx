import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/tenant";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata = { title: "Set up your shop" };

/**
 * Onboarding gate. Users who already have a business skip straight to
 * the dashboard — unless they explicitly asked to create another one
 * (?new=1 from the business switcher).
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  await requireAuth();
  const { new: creatingAnother } = await searchParams;

  const ctx = await getCurrentBusiness();
  if (ctx && creatingAnother !== "1") redirect("/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <OnboardingWizard />
    </main>
  );
}
