import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store,
  Wallet,
  Ban,
  AlertTriangle,
  KeyRound,
  IndianRupee,
  ArrowRight,
  UserX,
  Clock,
  CalendarDays,
  Building2,
} from "lucide-react";
import type {
  Vendor,
  VendorAccount,
  VendorNeonProject,
  PlatformSettings,
} from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────

type AttentionKind = "blocked" | "low" | "no-account";

type AttentionRow = {
  vendor: Vendor;
  kind: AttentionKind;
  availableDays: number;
  remainingCredits: number;
};

const ATTENTION_META: Record<
  AttentionKind,
  { label: string; badgeClass: string; icon: typeof Ban }
> = {
  blocked: {
    label: "Blocked",
    badgeClass:
      "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/30",
    icon: Ban,
  },
  low: {
    label: "Low on days",
    badgeClass:
      "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-900/30",
    icon: AlertTriangle,
  },
  "no-account": {
    label: "No account",
    badgeClass:
      "bg-accent text-foreground border-border hover:bg-accent",
    icon: UserX,
  },
};

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

// ── Stat card ────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
  loading,
  testId,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: typeof Store;
  tone: string;
  loading?: boolean;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-muted-foreground">{title}</p>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-16" />
      ) : (
        <p
          className="mt-1 text-2xl font-bold text-foreground"
          data-testid={testId}
        >
          {value}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  const { data: vendors, isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery<
    VendorAccount[]
  >({
    queryKey: ["/api/vendor-accounts"],
  });

  const { data: projects } = useQuery<VendorNeonProject[]>({
    queryKey: ["/api/vendor-neon-projects"],
  });

  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
  });

  const loading = vendorsLoading || accountsLoading;

  const accountByVendor = useMemo(() => {
    const map = new Map<number, VendorAccount>();
    (accounts ?? []).forEach((a) => map.set(a.vendorId, a));
    return map;
  }, [accounts]);

  // Health of every vendor, derived with the same rules the
  // Vendor Accounts page and isVendorBlocked() use.
  const health = useMemo(() => {
    const rows = (vendors ?? []).map((vendor) => {
      const account = accountByVendor.get(vendor.id);
      if (!account) {
        return {
          vendor,
          kind: "no-account" as AttentionKind,
          availableDays: 0,
          remainingCredits: 0,
          hasAccount: false,
          blocked: false,
          low: false,
        };
      }
      const remainingCredits = Math.max(
        account.creditDays - account.usedCredits,
        0
      );
      const blocked =
        account.availableDays <= 0 && remainingCredits <= 0;
      const low =
        !blocked && (remainingCredits <= 2 || account.availableDays <= 3);
      return {
        vendor,
        kind: (blocked
          ? "blocked"
          : low
            ? "low"
            : "no-account") as AttentionKind,
        availableDays: account.availableDays,
        remainingCredits,
        hasAccount: true,
        blocked,
        low,
      };
    });

    return {
      rows,
      total: rows.length,
      healthy: rows.filter((r) => r.hasAccount && !r.blocked && !r.low)
        .length,
      low: rows.filter((r) => r.low).length,
      blocked: rows.filter((r) => r.blocked).length,
      noAccount: rows.filter((r) => !r.hasAccount).length,
      totalAvailableDays: rows.reduce(
        (sum, r) => sum + r.availableDays,
        0
      ),
    };
  }, [vendors, accountByVendor]);

  const attentionRows = useMemo<AttentionRow[]>(
    () =>
      health.rows
        .filter((r) => r.blocked || r.low || !r.hasAccount)
        .sort((a, b) => {
          const rank: Record<AttentionKind, number> = {
            blocked: 0,
            low: 1,
            "no-account": 2,
          };
          return rank[a.kind] - rank[b.kind];
        })
        .map(({ vendor, kind, availableDays, remainingCredits }) => ({
          vendor,
          kind,
          availableDays,
          remainingCredits,
        })),
    [health.rows]
  );

  const activeVendors = (vendors ?? []).filter(
    (v) => v.status === "active"
  ).length;
  const inactiveVendors = (vendors ?? []).length - activeVendors;
  const vendorsWithProjects = new Set(
    (projects ?? []).map((p) => p.vendorId)
  ).size;
  const attentionCount =
    health.blocked + health.low + health.noAccount;

  // Stacked health bar — each segment width as a percentage.
  const healthSegments = [
    {
      key: "healthy",
      label: "Healthy",
      count: health.healthy,
      className: "bg-green-500",
    },
    {
      key: "low",
      label: "Low on days",
      count: health.low,
      className: "bg-amber-500",
    },
    {
      key: "blocked",
      label: "Blocked",
      count: health.blocked,
      className: "bg-red-500",
    },
    {
      key: "no-account",
      label: "No account",
      count: health.noAccount,
      className: "bg-gray-300 dark:bg-gray-600",
    },
  ];

  const emptyState = !loading && (vendors ?? []).length === 0;

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Platform overview — vendors, accounts and Neon projects at a
            glance
          </p>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          title="Total Vendors"
          value={health.total}
          subtitle={`${activeVendors} active · ${inactiveVendors} inactive`}
          icon={Store}
          tone="bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400"
          loading={loading}
          testId="text-total-vendors"
        />
        <StatCard
          title="Vendor Accounts"
          value={(accounts ?? []).length}
          subtitle={`${health.totalAvailableDays} total days available`}
          icon={Wallet}
          tone="bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400"
          loading={loading}
          testId="text-total-accounts"
        />
        <StatCard
          title="Blocked Accounts"
          value={health.blocked}
          subtitle={
            health.blocked > 0
              ? "Logins disabled — renew their days"
              : "All vendors can log in"
          }
          icon={Ban}
          tone="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
          loading={loading}
          testId="text-blocked-accounts"
        />
        <StatCard
          title="Low on Days"
          value={health.low}
          subtitle="3 or fewer days remaining"
          icon={AlertTriangle}
          tone="bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400"
          loading={loading}
          testId="text-low-days"
        />
        <StatCard
          title="Neon Projects"
          value={(projects ?? []).length}
          subtitle={`${vendorsWithProjects} of ${health.total} vendors provisioned`}
          icon={KeyRound}
          tone="bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400"
          loading={loading}
          testId="text-neon-projects"
        />
        <StatCard
          title="Platform Fee"
          value={settings ? formatCurrency(settings.platformFee) : "—"}
          subtitle="Default fee for vendors without their own"
          icon={IndianRupee}
          tone="bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400"
          loading={!settings}
          testId="text-platform-fee"
        />
      </div>

      {/* ── Empty state for a brand-new platform ── */}
      {emptyState ? (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/20">
            <Building2 className="h-7 w-7 text-red-500 dark:text-red-400" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            Welcome to the Admin Panel
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Vendors you add from the Vendors tab will show up here, along
            with their account health and Neon projects.
          </p>
        </div>
      ) : (
        <>
          {/* ── Needs attention + Account health ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Needs attention */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/20">
                    <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Needs Attention
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Blocked, low-day and account-less vendors
                    </p>
                  </div>
                </div>
                {attentionCount > 0 && (
                  <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/30">
                    {attentionCount}
                  </Badge>
                )}
              </div>

              <div className="divide-y divide-gray-100">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-lg" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : attentionRows.length === 0 ? (
                  <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 dark:bg-green-950/20">
                      <KeyRound className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      Everything looks good
                    </p>
                    <p className="text-xs text-muted-foreground">
                      No blocked or low-day vendors right now
                    </p>
                  </div>
                ) : (
                  attentionRows.slice(0, 6).map((row) => {
                    const meta = ATTENTION_META[row.kind];
                    const KindIcon = meta.icon;
                    return (
                      <div
                        key={row.vendor.id}
                        className="flex items-center gap-3 px-4 sm:px-5 py-3"
                        data-testid={`row-attention-${row.vendor.id}`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted border border-border">
                          <KindIcon
                            className={`h-4 w-4 ${
                              row.kind === "blocked"
                                ? "text-red-500 dark:text-red-400"
                                : row.kind === "low"
                                  ? "text-amber-500 dark:text-amber-400"
                                  : "text-muted-foreground"
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {row.vendor.businessName ||
                              `${row.vendor.firstName} ${row.vendor.lastName}`}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {row.vendor.firstName} {row.vendor.lastName} ·{" "}
                            {row.vendor.phone}
                          </p>
                        </div>
                        <div className="hidden sm:block text-right">
                          <p className="text-sm font-medium text-foreground">
                            {row.kind === "no-account"
                              ? "—"
                              : `${row.availableDays}d left`}
                          </p>
                          {row.kind !== "no-account" && (
                            <p className="text-xs text-muted-foreground">
                              {row.remainingCredits} credits left
                            </p>
                          )}
                        </div>
                        <Badge
                          className={`border ${meta.badgeClass}`}
                          data-testid={`badge-attention-${row.vendor.id}`}
                        >
                          {meta.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setLocation("/admin/vendor-accounts")}
                        >
                          Manage
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>

              {!loading && attentionRows.length > 6 && (
                <div className="border-t border-border px-4 sm:px-5 py-2.5">
                  <button
                    onClick={() => setLocation("/admin/vendor-accounts")}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  >
                    View all {attentionRows.length} vendors needing attention →
                  </button>
                </div>
              )}
            </div>

            {/* Account health */}
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/20">
                  <Wallet className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Account Health
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Across all vendor accounts
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="mt-4 space-y-3">
                  <Skeleton className="h-3 w-full rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ) : (
                <>
                  {/* Stacked health bar */}
                  <div
                    className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-accent"
                    role="img"
                    aria-label="Account health distribution"
                  >
                    {healthSegments
                      .filter((s) => s.count > 0)
                      .map((s) => (
                        <div
                          key={s.key}
                          className={s.className}
                          style={{
                            width: `${
                              health.total > 0
                                ? (s.count / health.total) * 100
                                : 0
                            }%`,
                          }}
                          title={`${s.label}: ${s.count}`}
                        />
                      ))}
                  </div>

                  <div className="mt-4 space-y-2.5 flex-1">
                    {healthSegments.map((s) => (
                      <div
                        key={s.key}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-2 text-foreground">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${s.className}`}
                          />
                          {s.label}
                        </span>
                        <span className="font-semibold text-foreground">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-border bg-muted p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Total available days
                      </span>
                      <span className="font-semibold text-foreground">
                        {health.totalAvailableDays}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Outstanding credit days
                      </span>
                      <span className="font-semibold text-foreground">
                        {health.rows.reduce(
                          (sum, r) =>
                            sum +
                            (r.hasAccount
                              ? Math.min(
                                  (accountByVendor.get(r.vendor.id)
                                    ?.usedCredits ?? 0),
                                  accountByVendor.get(r.vendor.id)
                                    ?.creditDays ?? 0
                                )
                              : 0),
                          0
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
