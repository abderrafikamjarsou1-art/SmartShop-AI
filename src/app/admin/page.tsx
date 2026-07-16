import { requireSuperAdmin } from "@/lib/auth";
import { adminService } from "@/services/admin-service";
import { formatMoney } from "@/lib/format";
import { PageHeader, SectionHeader, StatCard } from "@/components/shared/page-primitives";
import { AdminBusinessTable, AdminBroadcast } from "@/components/admin/admin-ui";
import { Card, CardContent } from "@/components/ui/card";
import {
  Banknote, Building2, Users, Sparkles, TrendingDown, UserPlus, Timer, BadgeCheck,
} from "lucide-react";

export const metadata = { title: "Platform Admin" };

export default async function AdminPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const admin = await requireSuperAdmin();
  const { q, page } = await searchParams;

  const [kpis, businesses, auditLogs] = await Promise.all([
    adminService.getPlatformKpis(),
    adminService.listBusinesses(q, Number(page) || 1),
    adminService.recentAuditLogs(15),
  ]);

  return (
    <>
      <PageHeader title="Platform overview" description={`Signed in as ${admin.email}`} />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR" value={formatMoney(kpis.mrr, "USD")} hint={`ARR ${formatMoney(kpis.arr, "USD")}`} icon={Banknote} />
        <StatCard label="Active businesses" value={String(kpis.activeBusinesses)} icon={Building2} />
        <StatCard label="Users" value={String(kpis.activeUsers)} hint={`+${kpis.newSignups30d} in 30 days`} icon={Users} />
        <StatCard label="Paying subscriptions" value={String(kpis.payingSubscriptions)} icon={BadgeCheck} />
        <StatCard label="Trials" value={String(kpis.trialUsers)} icon={Timer} />
        <StatCard label="Churn (30d)" value={`${kpis.churnRate}%`} icon={TrendingDown} />
        <StatCard label="New signups (30d)" value={String(kpis.newSignups30d)} icon={UserPlus} />
        <StatCard label="AI requests (month)" value={String(kpis.aiRequestsThisMonth)} icon={Sparkles} />
      </div>

      {/* Plan distribution */}
      <Card className="mt-6 shadow-soft">
        <CardContent className="flex flex-wrap gap-6 p-5">
          {kpis.byPlan.map((p) => (
            <div key={p.plan}>
              <p className="text-sm text-muted-foreground">{p.plan}</p>
              <p className="tabular text-2xl font-semibold">{p.count}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Businesses */}
      <div className="mt-8">
        <SectionHeader title="Businesses" description="Search, suspend, set plans, impersonate (read-only)" />
        <AdminBusinessTable
          businesses={businesses.items.map((b) => ({
            id: b.id,
            name: b.name,
            plan: b.subscription?.plan ?? "FREE",
            status: b.subscription?.status ?? "ACTIVE",
            members: b._count.members,
            products: b._count.products,
            sales: b._count.sales,
            suspended: !!b.suspendedAt,
            createdAt: b.createdAt.toISOString(),
          }))}
          totalPages={businesses.totalPages}
        />
      </div>

      {/* Broadcast + audit */}
      <div className="mt-8 grid gap-4 xl:grid-cols-2">
        <AdminBroadcast />
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Admin audit trail" />
            <ul className="divide-y">
              {auditLogs.map((log) => (
                <li key={log.id} className="py-2 text-sm">
                  <span className="font-medium">{log.action}</span>
                  <span className="text-muted-foreground"> · {log.business.name} · {log.user?.email ?? "system"} · {log.createdAt.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
