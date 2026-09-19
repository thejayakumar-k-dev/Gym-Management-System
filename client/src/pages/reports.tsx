import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Users,
  UserCheck,
  UserX,
  CalendarCheck,
  Wallet,
  CreditCard,
  TrendingUp,
  Banknote,
  BarChart3,
  KeyRound,
  AlertTriangle,
  Building2,
} from "lucide-react";
import type { Vendor, VendorReport } from "@shared/schema";

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function Reports() {
  const [vendorId, setVendorId] = useState("");

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const {
    data: report,
    isLoading,
    isFetching,
    error,
  } = useQuery<VendorReport>({
    queryKey: ["/api/reports/vendor", vendorId],
    enabled: !!vendorId,
  });

  const status = error ? Number(String(error.message).split(":")[0]) : 0;
  const noKeys = status === 404;
  const connectionError = !!error && !noKeys;
  const loading = !!vendorId && (isLoading || isFetching) && !report;

  const stats = report
    ? [
        {
          label: "Total Members",
          value: String(report.totalMembers),
          icon: Users,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "Active Members",
          value: String(report.activeMembers),
          icon: UserCheck,
          color: "text-green-600 bg-green-50",
        },
        {
          label: "Expired Members",
          value: String(report.expiredMembers),
          icon: UserX,
          color: "text-red-600 bg-red-50",
        },
        {
          label: "Today's Attendance",
          value: String(report.todayAttendance),
          icon: CalendarCheck,
          color: "text-purple-600 bg-purple-50",
        },
        {
          label: "Cash in Hand",
          value: formatCurrency(report.cashInHand),
          icon: Wallet,
          color: "text-emerald-600 bg-emerald-50",
        },
        {
          label: "Online Payments",
          value: formatCurrency(report.onlinePayments),
          icon: CreditCard,
          color: "text-indigo-600 bg-indigo-50",
        },
        {
          label: "This Month Income",
          value: formatCurrency(report.thisMonthIncome),
          icon: TrendingUp,
          color: "text-orange-600 bg-orange-50",
        },
        {
          label: "Total Income",
          value: formatCurrency(report.totalIncome),
          icon: Banknote,
          color: "text-red-600 bg-red-50",
        },
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500">
            Summary reports pulled from a vendor&apos;s own database
          </p>
        </div>

        {/* Vendor selector */}
        <div className="w-full sm:w-72">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger
              className="bg-white"
              data-testid="select-report-vendor"
            >
              <Building2 className="h-4 w-4 mr-2 text-gray-400" />
              <SelectValue placeholder="Select a vendor" />
            </SelectTrigger>
            <SelectContent>
              {(vendors ?? []).length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">
                  No vendors available
                </div>
              ) : (
                (vendors ?? []).map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.firstName} {v.lastName}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Body ── */}
      {!vendorId ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 sm:p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <BarChart3 className="h-7 w-7 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            Select a vendor to view reports
          </h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Choose a vendor from the dropdown above. Reports are loaded using
            the Neon project configured for that vendor.
          </p>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <Skeleton className="h-5 w-24 mb-3" />
                <Skeleton className="h-7 w-20" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <Skeleton className="h-6 w-40 mb-4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full mb-2" />
            ))}
          </div>
        </div>
      ) : noKeys ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 sm:p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <KeyRound className="h-7 w-7 text-amber-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            No Neon project configured
          </h3>
          <p className="text-sm text-gray-500 max-w-sm">
            This vendor doesn&apos;t have Neon credentials yet. Add them in
            the <span className="font-semibold">Neon Projects</span> tab to load
            their reports.
          </p>
        </div>
      ) : connectionError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 sm:p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            Could not load the report
          </h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Failed to connect to this vendor&apos;s database. Verify the keys in
            the <span className="font-semibold">Neon Projects</span> tab.
          </p>
        </div>
      ) : report ? (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}
                  >
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide font-semibold text-gray-400">
                      {stat.label}
                    </p>
                    <p className="text-lg font-bold text-gray-900 truncate">
                      {stat.value}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Monthly income */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-sm font-bold text-gray-900">
                Monthly Income — {new Date().getFullYear()}
              </h3>
              <span className="text-xs text-gray-400">
                {report.totalPayments} payments total
              </span>
            </div>
            <Table className="min-w-[420px]">
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="font-semibold text-gray-700">
                    Month
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700 text-right">
                    Payments
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700 text-right">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.monthlyBreakdown.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium text-gray-900">
                      {m.month}
                    </TableCell>
                    <TableCell className="text-right text-gray-600">
                      {m.count}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-gray-900">
                      {formatCurrency(m.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
