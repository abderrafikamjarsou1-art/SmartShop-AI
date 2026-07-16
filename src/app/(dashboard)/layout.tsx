import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/tenant";
import { getPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listRecentNotifications } from "@/services/stock-alerts";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Dashboard layout — Server Component.
 * Runs once per navigation: verifies auth, resolves the tenant,
 * loads memberships for the switcher, computes the permission list,
 * then hands plain serializable props to the client shell.
 * No business -> onboarding. (Middleware already blocked guests;
 * this is defense-in-depth.)
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const ctx = await getCurrentBusiness();
  if (!ctx) redirect("/onboarding");

  const [memberships, notifications] = await Promise.all([
    prisma.userBusiness.findMany({
      where: { userId: user.id, business: { deletedAt: null } },
      include: { business: { select: { id: true, name: true, logoUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    listRecentNotifications(ctx),
  ]);

  return (
    <AppShell
      user={{
        name: user.fullName ?? user.email,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isSuperAdmin: user.isSuperAdmin,
      }}
      businesses={memberships.map((m) => ({
        id: m.business.id,
        name: m.business.name,
        logoUrl: m.business.logoUrl,
      }))}
      activeBusinessId={ctx.businessId}
      role={ctx.role}
      permissions={getPermissions(ctx.role)}
      notifications={notifications.items.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        link: n.link,
        createdAt: n.createdAt.toISOString(),
        unread: n.readAt === null,
      }))}
      unreadCount={notifications.unread}
    >
      {children}
    </AppShell>
  );
}
