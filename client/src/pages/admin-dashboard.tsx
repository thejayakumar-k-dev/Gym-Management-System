import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      "bg-red-100 text-red-700 border-red-200 hover:bg-red-100",
    icon: Ban,
  },
  low: {
    label: "Low on days",
    badgeClass:
      "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100",
    icon: AlertTriangle,
  },
  "no-account": {
    label: "No account",
    badgeClass:
      "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100",
    icon: UserX,
  },
};

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-gray-500">{title}</p>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-16" />
      ) : (
        <p
          className="mt-1 text-2xl font-bold text-gray-900"
          data-testid={testId}
        >
          {value}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
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

  const recentVendors = useMemo(
    () => (vendors ?? []).slice(0, 5),
    [vendors]
  );

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
      className: "bg-gray-300",
    },
  ];

  const emptyState = !loading && (vendors ?? []).length === 0;

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500">
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
          tone="bg-blue-50 text-blue-600"
          loading={loading}
          testId="text-total-vendors"
        />
        <StatCard
          title="Vendor Accounts"
          value={(accounts ?? []).length}
          subtitle={`${health.totalAvailableDays} total days available`}
          icon={Wallet}
          tone="bg-indigo-50 text-indigo-600"
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
          tone="bg-red-50 text-red-600"
          loading={loading}
          testId="text-blocked-accounts"
        />
        <StatCard
          title="Low on Days"
          value={health.low}
          subtitle="3 or fewer days remaining"
          icon={AlertTriangle}
          tone="bg-amber-50 text-amber-600"
          loading={loading}
          testId="text-low-days"
        />
        <StatCard
          title="Neon Projects"
          value={(projects ?? []).length}
          subtitle={`${vendorsWithProjects} of ${health.total} vendors provisioned`}
          icon={KeyRound}
          tone="bg-purple-50 text-purple-600"
          loading={loading}
          testId="text-neon-projects"
        />
        <StatCard
          title="Platform Fee"
          value={settings ? formatCurrency(settings.platformFee) : "—"}
          subtitle="Global fee added to every service charge"
          icon={IndianRupee}
          tone="bg-green-50 text-green-600"
          loading={!settings}
          testId="text-platform-fee"
        />
      </div>

      {/* ── Empty state for a brand-new platform ── */}
      {emptyState ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <Building2 className="h-7 w-7 text-red-500" />
          </div>
          <h3 className="text-base font-bold text-gray-900">
            Welcome to the Admin Panel
          </h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Vendors you add from the Vendors tab will show up here, along
            with their account health and Neon projects.
          </p>
        </div>
      ) : (
        <>
          {/* ── Needs attention + Account health ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Needs attention */}
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Needs Attention
                    </p>
                    <p className="text-xs text-gray-500">
                      Blocked, low-day and account-less vendors
                    </p>
                  </div>
                </div>
                {attentionCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100">
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
                      <KeyRound className="h-5 w-5 text-green-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      Everything looks good
                    </p>
                    <p className="text-xs text-gray-500">
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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 border border-gray-100">
                          <KindIcon
                            className={`h-4 w-4 ${
                              row.kind === "blocked"
                                ? "text-red-500"
                                : row.kind === "low"
                                  ? "text-amber-500"
                                  : "text-gray-400"
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {row.vendor.businessName ||
                              `${row.vendor.firstName} ${row.vendor.lastName}`}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {row.vendor.firstName} {row.vendor.lastName} ·{" "}
                            {row.vendor.phone}
                          </p>
                        </div>
                        <div className="hidden sm:block text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {row.kind === "no-account"
                              ? "—"
                              : `${row.availableDays}d left`}
                          </p>
                          {row.kind !== "no-account" && (
                            <p className="text-xs text-gray-500">
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
                          className="h-8 text-gray-500 hover:text-gray-900"
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
                <div className="border-t border-gray-100 px-4 sm:px-5 py-2.5">
                  <button
                    onClick={() => setLocation("/admin/vendor-accounts")}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    View all {attentionRows.length} vendors needing attention →
                  </button>
                </div>
              )}
            </div>

            {/* Account health */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 flex flex-col">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
                  <Wallet className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Account Health
                  </p>
                  <p className="text-xs text-gray-500">
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
                    className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-gray-100"
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
                        <span className="flex items-center gap-2 text-gray-600">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${s.className}`}
                          />
                          {s.label}
                        </span>
                        <span className="font-semibold text-gray-900">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Total available days
                      </span>
                      <span className="font-semibold text-gray-900">
                        {health.totalAvailableDays}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Clock className="h-3.5 w-3.5" />
                        Outstanding credit days
                      </span>
                      <span className="font-semibold text-gray-900">
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

          {/* ── Recent vendors ── */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 sm:px-5 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                  <Store className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Recent Vendors
                  </p>
                  <p className="text-xs text-gray-500">
                    The latest vendors added to the platform
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setLocation("/admin/vendors")}
                data-testid="button-view-all-vendors"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>

            <div className="overflow-x-auto [&_th]:border-r [&_th]:border-gray-200 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-100 [&_td:last-child]:border-r-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-100">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
                    <TableHead className="font-semibold text-gray-700">
                      Vendor
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700">
                      Contact
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700">
                      Location
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700">
                      Joined
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-24" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : recentVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Store className="h-8 w-8 text-gray-300" />
                          <p className="text-sm text-gray-500">
                            No vendors yet
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentVendors.map((vendor) => (
                      <TableRow
                        key={vendor.id}
                        data-testid={`row-recent-vendor-${vendor.id}`}
                      >
                        <TableCell>
                          {vendor.businessName && (
                            <div className="text-sm font-semibold text-gray-900">
                              {vendor.businessName}
                            </div>
                          )}
                          <div
                            className={`text-sm ${
                              vendor.businessName
                                ? "text-gray-500"
                                : "font-medium text-gray-900"
                            }`}
                          >
                            {vendor.firstName} {vendor.lastName}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {vendor.phone}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {[vendor.city, vendor.state]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {formatDate(vendor.createdAt)}
                        </TableCell>
                        <TableCell>
                          {vendor.status === "active" ? (
                            <Badge className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-100">
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-100">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
