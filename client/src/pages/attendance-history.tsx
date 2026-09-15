import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { Download, Search, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Attendance } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Helper function to format time from ISO UTC to local time
function formatTime(time: string | null | undefined) {
  if (!time) return "-";

  // New ISO format case
  if (time.includes("T")) {
    const d = new Date(time); // convert ISO to Date
    if (isNaN(d.getTime())) return time;
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Old plain time format case
  return time;
}

export default function AttendanceHistory() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [searchRegister, setSearchRegister] = useState("");
  const { toast } = useToast();

  const { data: attendanceRecords, isLoading } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance", selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/attendance?date=${selectedDate}`);
      if (!res.ok) throw new Error("Failed to fetch attendance records");
      return res.json();
    },
  });

  const filteredRecords = attendanceRecords?.filter(
    (record) =>
      !searchRegister ||
      record.registerNo.toLowerCase().includes(searchRegister.toLowerCase()) ||
      record.studentName.toLowerCase().includes(searchRegister.toLowerCase())
  );

  const handleExportCSV = () => {
    if (!filteredRecords || filteredRecords.length === 0) {
      toast({
        title: "No data to export",
        description: "Please select a date with attendance records",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Date", "Register No.", "Student Name", "Time In"];
    const rows = filteredRecords.map((record) => [
      record.date,
      record.registerNo,
      record.studentName,
      record.timeIn,
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${selectedDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: "CSV exported successfully" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Attendance History</h1>
          <p className="text-sm text-muted-foreground mt-1">View and export attendance records</p>
        </div>
        <Button
          onClick={handleExportCSV}
          variant="outline"
          disabled={!filteredRecords || filteredRecords.length === 0}
          data-testid="button-export-csv"
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>
            Showing {filteredRecords?.length ?? 0} record(s) for{" "}
            {new Date(selectedDate).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Select Date
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                data-testid="input-select-date"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search by Register Number
              </label>
              <Input
                placeholder="Enter register number..."
                value={searchRegister}
                onChange={(e) => setSearchRegister(e.target.value)}
                data-testid="input-search-register"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredRecords && filteredRecords.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Register No.</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Time In</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id} data-testid={`row-attendance-${record.id}`}>
                      <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{record.registerNo}</TableCell>
                      <TableCell>{record.studentName}</TableCell>
                      <TableCell>{formatTime(record.timeIn)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No attendance records found for this date</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
