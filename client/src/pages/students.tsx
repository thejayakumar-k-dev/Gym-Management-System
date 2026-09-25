import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, AlertCircle, CheckCircle, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemberBatch, Student } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertStudentSchema, NAME_REGEX, PHONE_REGEX } from "@shared/schema";
import { isMembershipExpired } from "@shared/duration";
import { formatDate } from "@/lib/format";
import { useReadOnly } from "@/lib/read-only";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = insertStudentSchema;

type FormValues = z.infer<typeof formSchema>;

const MEMBER_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
] as const;

type MemberFilter = (typeof MEMBER_FILTERS)[number]["value"];

type AttendanceFeedback = {
  type: "success" | "already_marked" | "expired" | "not_found";
  data: {
    name: string | null;
    date: string | null;
    timeIn: string | null;
    daysLeft: number | null;
    status: string | null;
  };
} | null;

export default function Students({ isAdmin }: { isAdmin: boolean }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  // Admin viewing this vendor's panel in Read Only mode — no adds or edits.
  const readOnly = useReadOnly();
  const [attendanceFeedback, setAttendanceFeedback] = useState<AttendanceFeedback>(null);
  const { toast } = useToast();

  const { data: studentsData, isLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const students = useMemo(
    () => (studentsData ? [...studentsData].reverse() : undefined),
    [studentsData],
  );

  const filteredStudents = useMemo(() => {
    if (!students) return students;

    const query = searchQuery.trim().toLowerCase();
    const searchedStudents = query
      ? students.filter(
          (student) =>
            student.registerNo.toLowerCase().includes(query) ||
            student.name.toLowerCase().includes(query) ||
            student.phone.toLowerCase().includes(query),
        )
      : students;

    if (memberFilter === "all") return searchedStudents;
    if (memberFilter === "morning" || memberFilter === "evening") {
      return searchedStudents.filter((student) => student.batch === memberFilter);
    }
    const wantActive = memberFilter === "active";
    return searchedStudents.filter(
      (student) => !isMembershipExpired(student.expiryDate) === wantActive,
    );
  }, [students, memberFilter, searchQuery]);

  const nextRegisterNo = useMemo(() => {
    if (!studentsData || studentsData.length === 0) return "1";
    const max = studentsData.reduce((m, s) => {
      const n = parseInt(s.registerNo, 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return String(max + 1);
  }, [studentsData]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registerNo: "",
      name: "",
      batch: "morning",
      phone: "",
      address: "",
      joinDate: new Date().toISOString().split("T")[0],
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => apiRequest("POST", "/api/students", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Student added successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      const duplicate = String(error?.message || "").includes("Member ID already exists");
      if (duplicate) {
        form.setError("registerNo", { type: "manual", message: "Member ID already exists" });
      }
      toast({ title: duplicate ? "Member ID already exists" : "Failed to add student", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: FormValues & { id: number }) => {
      const response = await apiRequest("PATCH", `/api/students/${id}`, data);
      return (await response.json()) as Student;
    },
    onSuccess: (updatedStudent) => {
      queryClient.setQueryData<Student[]>(["/api/students"], (currentStudents) =>
        currentStudents?.map((student) =>
          student.id === updatedStudent.id ? updatedStudent : student,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Student updated successfully" });
      setIsDialogOpen(false);
      setEditingStudent(null);
      form.reset();
    },
    onError: (error: any) => {
      const duplicate = String(error?.message || "").includes("Member ID already exists");
      if (duplicate) {
        form.setError("registerNo", { type: "manual", message: "Member ID already exists" });
      }
      toast({ title: duplicate ? "Member ID already exists" : "Failed to update student", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/students/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Student deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete student", variant: "destructive" });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: (registerNo: string) => 
      apiRequest("POST", "/api/attendance", { registerNumber: Number(registerNo) }),
    onSuccess: async (response: any) => {
      const data = await response.json();
      
      if (data.type === "success") {
        queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
      
      setAttendanceFeedback({
        type: data.type,
        data: {
          name: data.name,
          date: data.date,
          timeIn: data.timeIn,
          daysLeft: data.daysLeft,
          status: data.status,
        },
      });
    },
    onError: (error: any) => {
      try {
        const errorData = JSON.parse(error.message.split(": ")[1] || "{}");
        setAttendanceFeedback({
          type: errorData.type || "not_found",
          data: {
            name: errorData.name || null,
            date: errorData.date || null,
            timeIn: errorData.timeIn || null,
            daysLeft: errorData.daysLeft || null,
            status: errorData.status || null,
          },
        });
      } catch {
        setAttendanceFeedback({
          type: "not_found",
          data: {
            name: null,
            date: null,
            timeIn: null,
            daysLeft: null,
            status: null,
          },
        });
      }
    },
  });

  const handleOpenDialog = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      form.reset({
        registerNo: student.registerNo,
        name: student.name,
        batch: student.batch,
        phone: student.phone,
        address: student.address || "",
        joinDate: student.joinDate,
      });
    } else {
      setEditingStudent(null);
      form.reset({
        registerNo: nextRegisterNo,
        name: "",
        batch: "morning",
        phone: "",
        address: "",
        joinDate: new Date().toISOString().split("T")[0],
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: FormValues) => {
    const registerNo = data.registerNo.trim();
    const duplicate = studentsData?.some(
      (student) =>
        student.registerNo === registerNo && student.id !== editingStudent?.id,
    );

    if (duplicate) {
      form.setError("registerNo", {
        type: "manual",
        message: "Member ID already exists",
      });
      return;
    }

    const formData = { ...data, registerNo };
    if (editingStudent) {
      updateMutation.mutate({ ...formData, id: editingStudent.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getStatus = (expiryDate: string | null) => {
    if (!expiryDate) return "Pay Required";
    return isMembershipExpired(expiryDate) ? "Expired" : "Active";
  };

  const getBatchLabel = (batch: MemberBatch) =>
    batch === "evening" ? "Evening" : "Morning";

  const getDaysLeft = (expiryDate: string | null) => {
    if (!expiryDate) return 0;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Students</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage gym members</p>
        </div>
        {!readOnly && (
          <Button onClick={() => handleOpenDialog()} className="w-full sm:w-auto" data-testid="button-add-student">
            <Plus className="mr-2 h-4 w-4" />
            Add Student
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle>Members List</CardTitle>
            <CardDescription>View and manage all gym members</CardDescription>
          </div>
          <div
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted p-1"
            role="tablist"
            aria-label="Filter members by membership or batch"
          >
            {MEMBER_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={memberFilter === filter.value}
                onClick={() => setMemberFilter(filter.value)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  memberFilter === filter.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`filter-${filter.value}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by Member ID, name or phone"
              className="pl-9 pr-9"
              data-testid="input-search-members"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear member search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : students && students.length > 0 ? (
            filteredStudents && filteredStudents.length > 0 ? (
              <div className="rounded-md border">
                <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Status</TableHead>
                    {!readOnly && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow key={student.id} data-testid={`row-student-${student.id}`}>
                      <TableCell className="font-medium">{student.registerNo}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            student.batch === "morning"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                              : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
                          }
                        >
                          {getBatchLabel(student.batch)}
                        </Badge>
                      </TableCell>
                      <TableCell>{student.phone}</TableCell>
                      <TableCell>{student.address || "-"}</TableCell>
                      <TableCell>{formatDate(student.joinDate)}</TableCell>
                      <TableCell>{formatDate(student.expiryDate)}</TableCell>
                      <TableCell className={getStatus(student.expiryDate) === "Active" ? "text-green-600 dark:text-green-400 font-medium" : getStatus(student.expiryDate) === "Pay Required" ? "text-orange-600 dark:text-orange-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                        Days: {getDaysLeft(student.expiryDate)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getStatus(student.expiryDate) === "Active" ? "default" : "destructive"}
                          className={getStatus(student.expiryDate) === "Active" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : getStatus(student.expiryDate) === "Pay Required" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"}
                          data-testid={`badge-status-${student.id}`}
                        >
                          {getStatus(student.expiryDate)}
                        </Badge>
                      </TableCell>
                      {!readOnly && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(student)}
                              data-testid={`button-edit-${student.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && !readOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirmId(student.id)}
                              data-testid={`button-delete-${student.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>
                  {searchQuery.trim()
                    ? "No members match your search."
                    : `No ${MEMBER_FILTERS.find((filter) => filter.value === memberFilter)?.label.toLowerCase()} members found.`}
                </p>
              </div>
            )
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No students found. Add your first member to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent data-testid="dialog-student-form">
          <DialogHeader>
            <DialogTitle>{editingStudent ? "Edit Student" : "Add New Student"}</DialogTitle>
            <DialogDescription>
              {editingStudent ? "Update student information" : "Enter student details to register"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              <FormField
                control={form.control}
                name="registerNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member ID <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        onChange={(event) => {
                          field.onChange(event.target.value.replace(/\D/g, ""));
                          form.clearErrors("registerNo");
                        }}
                        data-testid="input-register-no"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="batch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batch <span className="text-red-500">*</span></FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-batch">
                          <SelectValue placeholder="Select batch" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        {...field}
                        maxLength={10}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value.replace(/\D/g, "").slice(0, 10)
                          )
                        }
                        data-testid="input-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter address" {...field} data-testid="input-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joinDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Join Date <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-join-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-student">
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingStudent ? "Update" : "Add Student"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this student? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId !== null) {
                  deleteMutation.mutate(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceFeedback !== null} onOpenChange={(open) => !open && setAttendanceFeedback(null)}>
        <DialogContent className="max-w-md" data-testid={`feedback-${attendanceFeedback?.type}`}>
          {attendanceFeedback && (
            <div className="space-y-6">
              <div className="text-center">
                {attendanceFeedback.type === "success" ? (
                  <div className="space-y-3">
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                    <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">Welcome</h2>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <AlertCircle className="h-16 w-16 text-red-500 mx-auto" />
                    <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {attendanceFeedback.type === "expired" ? "Membership Expired" : 
                       attendanceFeedback.type === "already_marked" ? "Already Checked In" : 
                       "Student Not Found"}
                    </h2>
                  </div>
                )}
              </div>

              {attendanceFeedback.data.name && (
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-900/30 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Name:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{attendanceFeedback.data.name}</span>
                  </div>
                  {attendanceFeedback.data.date && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Date:</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{attendanceFeedback.data.date}</span>
                    </div>
                  )}
                  {attendanceFeedback.data.timeIn && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Time In:</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{attendanceFeedback.data.timeIn}</span>
                    </div>
                  )}
                  {attendanceFeedback.data.daysLeft !== null && attendanceFeedback.data.daysLeft !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Days Left:</span>
                      <span
                        className={`font-semibold ${
                          Math.max(0, attendanceFeedback.data.daysLeft) > 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {Math.max(0, attendanceFeedback.data.daysLeft)} days
                      </span>
                    </div>
                  )}
                  {attendanceFeedback.data.status && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Status:</span>
                      <span
                        className={`font-semibold ${
                          attendanceFeedback.data.status === "ACTIVE"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {attendanceFeedback.data.status}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={() => setAttendanceFeedback(null)}
                className={`w-full font-semibold text-white py-2 h-auto rounded-md ${
                  attendanceFeedback.type === "success"
                    ? "bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                }`}
                data-testid="button-close-feedback"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
