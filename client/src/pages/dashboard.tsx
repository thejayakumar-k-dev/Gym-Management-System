import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, CalendarCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useGymSettings } from "@/hooks/use-gym-settings";
import type { Student } from "@shared/schema";

interface DashboardStats {
  totalStudents: number;
  activeMemberships: number;
  expiredMemberships: number;
  todayAttendance: number;
}

export default function Dashboard() {
  const { settings } = useGymSettings();
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: students } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const expiredMembers = students?.filter((s) => {
    const expiryDate = new Date(s.expiryDate);
    const today = new Date();
    // Compare only the date part (set time to 00:00:00)
    expiryDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiryDate < today;
  }) || [];

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
      value: expiredMembers.length,
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
        <p className="text-sm text-muted-foreground mt-1">Welcome to {settings.name || "GymDesk"} Management System</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                  {stat.value}
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
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiredMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-md"
                  data-testid={`expired-member-${member.id}`}
                >
                  <div>
                    <p className="font-semibold text-foreground">{member.name}</p>
                    <p className="text-sm text-muted-foreground">Reg: {member.registerNo}</p>
                  </div>
                  <p className="font-bold text-red-600 dark:text-red-400">EXPIRED</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
