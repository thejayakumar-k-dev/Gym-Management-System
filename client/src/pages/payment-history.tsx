import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { TrendingUp, Search, History, Banknote, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Payment } from "@shared/schema";
import { formatDuration } from "@shared/duration";
import { formatDate, todayDateOnly } from "@/lib/format";

export default function PaymentHistory() {
  const [searchQuery, setSearchQuery] = useState("");
  // Defaults to today so the tab opens on the day's records. An empty string
  // still means "unbounded" on that end, so clearing a box widens the view.
  const [fromDate, setFromDate] = useState(todayDateOnly());
  const [toDate, setToDate] = useState(todayDateOnly());

  const { data: payments, isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });

  // A reversed range is a common slip; treat it as the same window rather than
  // silently returning nothing.
  const reversed = Boolean(fromDate && toDate && fromDate > toDate);
  const rangeStart = reversed ? toDate : fromDate;
  const rangeEnd = reversed ? fromDate : toDate;

  const filteredPayments = payments?.filter((payment) => {
    const matchesSearch =
      payment.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.registerNo.toLowerCase().includes(searchQuery.toLowerCase());
    // `payments.date` is a Postgres date column, already "YYYY-MM-DD", so
    // lexicographic string comparison is an exact, timezone-proof date range.
    const matchesRange =
      (!rangeStart || payment.date >= rangeStart) &&
      (!rangeEnd || payment.date <= rangeEnd);
    return matchesSearch && matchesRange;
  });

  const rangeTotal = filteredPayments?.reduce((sum, p) => sum + p.amount, 0) ?? 0;

  const overallTotal = payments?.reduce((sum, p) => sum + p.amount, 0) ?? 0;

  const rangeLabel =
    rangeStart && rangeEnd
      ? rangeStart === rangeEnd
        ? formatDate(rangeStart)
        : `${formatDate(rangeStart)} – ${formatDate(rangeEnd)}`
      : rangeStart
        ? `from ${formatDate(rangeStart)}`
        : rangeEnd
          ? `up to ${formatDate(rangeEnd)}`
          : "all dates";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Payment History</h1>
        <p className="text-sm text-muted-foreground mt-1">View all membership fee payments</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-orange-800 dark:text-orange-200 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Selected Period Total
              </CardTitle>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                {filteredPayments?.length ?? 0} payment(s) {rangeLabel}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-900 dark:text-orange-100" data-testid="text-selected-month-total">
              ₹ {rangeTotal.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Overall Total Income
              </CardTitle>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {payments?.length ?? 0} total payment(s) recorded
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-900 dark:text-green-100" data-testid="text-overall-total-income">
              ₹ {overallTotal}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Payment Records</CardTitle>
            <CardDescription>Search and filter payment history</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label
                htmlFor="filter-from"
                className="text-xs font-medium text-muted-foreground"
              >
                From
              </label>
              <Input
                id="filter-from"
                type="date"
                value={fromDate}
                max={rangeEnd || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                data-testid="input-filter-from"
                className="h-9 w-[9.5rem]"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="filter-to"
                className="text-xs font-medium text-muted-foreground"
              >
                To
              </label>
              <Input
                id="filter-to"
                type="date"
                value={toDate}
                min={rangeStart || undefined}
                onChange={(e) => setToDate(e.target.value)}
                data-testid="input-filter-to"
                className="h-9 w-[9.5rem]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or member ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-student"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredPayments && filteredPayments.length > 0 ? (
            <div className="rounded-md border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Token #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                      <TableCell className="font-medium">{payment.tokenNumber}</TableCell>
                      <TableCell>{formatDate(payment.date)}</TableCell>
                      <TableCell>{payment.registerNo}</TableCell>
                      <TableCell>{payment.studentName}</TableCell>
                      <TableCell>{formatDuration(payment.duration)}</TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-2 w-fit px-3 py-1 rounded-md ${
                          payment.paymentMethod === "cash" 
                            ? "bg-green-100 dark:bg-green-900/30" 
                            : "bg-blue-100 dark:bg-blue-900/30"
                        }`}>
                          {payment.paymentMethod === "cash" ? (
                            <Banknote className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          )}
                          <span className={`text-sm font-medium capitalize ${
                            payment.paymentMethod === "cash" 
                              ? "text-green-700 dark:text-green-300" 
                              : "text-blue-700 dark:text-blue-300"
                          }`}>
                            {payment.paymentMethod}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">₹ {payment.amount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No payment records found</p>
              {rangeStart || rangeEnd ? (
                <p className="text-sm mt-1">
                  Nothing was received {rangeLabel}. Try a wider range or pick
                  &ldquo;All Time&rdquo;.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
