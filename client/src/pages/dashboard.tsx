import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, UserX, CalendarCheck, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useGymName } from "@/lib/gym-name";
import { isMembershipExpired } from "@shared/duration";
import { formatDate } from "@/lib/format";
import { useReadOnly } from "@/lib/read-only";
import type { Student } from "@shared/schema";

interface DashboardStats {
  totalStudents: number;
  activeMemberships: number;
  expiredMemberships: number;
  todayAttendance: number;
}

function AnimatedCount({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 800;
    const startedAt = performance.now();
    let frameId = 0;

    const updateValue = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * easedProgress));

      if (progress < 1) {
        frameId = requestAnimationFrame(updateValue);
      }
    };

    frameId = requestAnimationFrame(updateValue);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <>{displayValue}</>;
}

export default function Dashboard() {
  const gymName = useGymName();
  const [, setLocation] = useLocation();
  const readOnly = useReadOnly();
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: students } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  // Same rule as the server stats and the attendance pad: a member with no
  // expiry date has never paid, and a member is expired from their expiry date
  // onwards. Anything that is not active belongs in this list.
  const expiredMembers =
    students?.filter((s) => isMembershipExpired(s.expiryDate)) || [];

  const statCards = [
    {
      title: "Total Students",
      value: stats?.totalStudents ?? 0,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500",
    },
    {
      title: "Active Memberships",
      value: stats?.activeMemberships ?? 0,
      icon: UserCheck,
      color: "text-green-500",
      bgColor: "bg-green-500",
    },
    {
      title: "Expired Memberships",
      value: stats?.expiredMemberships ?? expiredMembers.length,
      icon: UserX,
      color: "text-red-500",
      bgColor: "bg-red-500",
    },
    {
      title: "Today's Attendance",
      value: stats?.todayAttendance ?? 0,
      icon: CalendarCheck,
      color: "text-purple-500",
      bgColor: "bg-purple-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome to {gymName} Management System</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statCards.map((stat) => (
          <Card key={stat.title} data-testid={`card-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`h-8 w-8 rounded-md ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                  <p className="text-3xl font-bold text-foreground" data-testid={`text-${stat.title.toLowerCase().replace(/\s+/g, '-')}-value`}>
                    <AnimatedCount value={stat.value} />
                  </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {expiredMembers.length > 0 && (
        <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-200">
              <UserX className="h-5 w-5" />
              Expired Memberships
            </CardTitle>
            <CardDescription>
              {expiredMembers.length}{" "}
              {expiredMembers.length === 1 ? "member needs" : "members need"} attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto rounded-md border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                    {!readOnly && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiredMembers.map((member) => (
                    <TableRow
                      key={member.id}
                      data-testid={`expired-member-${member.id}`}
                    >
                      <TableCell className="font-medium">
                        {member.registerNo}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {member.name}
                      </TableCell>
                      <TableCell>{formatDate(member.expiryDate)}</TableCell>
                      <TableCell>
                        <span
                          className={`font-bold ${
                            member.expiryDate
                              ? "text-red-600 dark:text-red-400"
                              : "text-orange-600 dark:text-orange-400"
                          }`}
                          data-testid={`expired-member-status-${member.id}`}
                        >
                          {member.expiryDate ? "EXPIRED" : "PAY REQUIRED"}
                        </span>
                      </TableCell>
                      {!readOnly && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              setLocation(
                                `/payments?student=${encodeURIComponent(member.registerNo)}`
                              )
                            }
                            data-testid={`button-pay-now-${member.id}`}
                          >
                            <CreditCard className="h-4 w-4" />
                            Pay Now
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
