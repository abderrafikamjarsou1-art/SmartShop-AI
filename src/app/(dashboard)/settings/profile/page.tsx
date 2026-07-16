import { requireBusiness } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { user, role, business } = await requireBusiness();
  const name = user.fullName ?? user.email;
  const rows = [
    { label: "Full name", value: user.fullName ?? "—" },
    { label: "Email", value: user.email },
    { label: "Role", value: role.charAt(0) + role.slice(1).toLowerCase() },
    { label: "Business", value: business.name },
  ];

  return (
    <>
      <PageHeader title="Profile" description="Your account details." />
      <Card className="max-w-2xl shadow-soft">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
              <AvatarFallback className="text-lg">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <dl className="mt-6 divide-y">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-3">
                <dt className="text-sm text-muted-foreground">{r.label}</dt>
                <dd className="text-sm font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs text-muted-foreground">
            Need to change your name or password? Use the account menu or the password reset flow.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
