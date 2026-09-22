import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, CreditCard, TrendingUp, Calendar, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface IncomeStats {
  cashInHand: number;
  onlinePayments: number;
  thisMonthIncome: number;
  thisYearIncome: number;
  totalOverallIncome: number;
  monthlyBreakdown: {
    month: string;
    amount: number;
    paymentCount: number;
  }[];
  averageMonthlyIncome: number;
  totalPaymentsReceived: number;
}


export default function IncomeDashboard() {
  const { data: stats, isLoading } = useQuery<IncomeStats>({
    queryKey: ["/api/income/stats"],
  });

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toLocaleString("default", { month: "long" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Income Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your gym revenue and earnings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Cash in Hand
              </CardTitle>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Total cash payments</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-bold text-green-900 dark:text-green-100" data-testid="text-cash-in-hand">
                ₹ {stats?.cashInHand ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Online Payments
              </CardTitle>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Total online payments</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100" data-testid="text-online-payments">
                ₹ {stats?.onlinePayments ?? 0}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-orange-800 dark:text-orange-200 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                This Month Income
              </CardTitle>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">{currentMonth} {currentYear}</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-bold text-orange-900 dark:text-orange-100" data-testid="text-this-month-income">
                ₹ {stats?.thisMonthIncome ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                This Year Income
              </CardTitle>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{currentYear}</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100" data-testid="text-this-year-income">
                ₹ {stats?.thisYearIncome ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Overall Income
              </CardTitle>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">All time earnings</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-bold text-green-900 dark:text-green-100" data-testid="text-total-overall-income">
                ₹ {stats?.totalOverallIncome ?? 0}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Breakdown ({currentYear})</CardTitle>
          <CardDescription>Revenue breakdown by month</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(12)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats?.monthlyBreakdown.map((month) => (
                <Card key={month.month} className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-sm text-muted-foreground">{month.month}</h3>
                      <Badge className="bg-blue-200 dark:bg-blue-700 text-blue-900 dark:text-blue-100">{month.paymentCount} payments</Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground flex items-center gap-1">
                      <span className="text-green-600">₹</span>
                      {month.amount}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardHeader>
            <CardTitle className="text-black dark:text-white">Average Monthly Income</CardTitle>
            <CardDescription>Based on {currentYear} data</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-bold text-black dark:text-white flex items-center gap-1" data-testid="text-avg-monthly-income">
                <span className="text-green-600">₹</span>
                {stats?.averageMonthlyIncome ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardHeader>
            <CardTitle className="text-black dark:text-white">Total Payments Received</CardTitle>
            <CardDescription>All time payment count</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-3xl font-bold text-black dark:text-white flex items-center gap-1" data-testid="text-total-payments">
                <span className="text-blue-600 dark:text-blue-400">$</span>
                {stats?.totalPaymentsReceived ?? 0}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
