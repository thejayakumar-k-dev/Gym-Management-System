import { useState } from "react";
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
import { Plus, Pencil, Trash2, Users, LogIn, AlertCircle, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Student } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertStudentSchema } from "@shared/schema";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = insertStudentSchema.omit({ expiryDate: true }).extend({
  registerNo: z.string().min(1, "Register number is required"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(10, "Valid phone number is required"),
});

type FormValues = z.infer<typeof formSchema>;

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

export default function Students() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [attendanceFeedback, setAttendanceFeedback] = useState<AttendanceFeedback>(null);
  const { toast } = useToast();

  const { data: studentsData, isLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const students = studentsData ? [...studentsData].reverse() : undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registerNo: "",
      name: "",
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
    onError: () => {
      toast({ title: "Failed to add student", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: FormValues & { id: number }) =>
      apiRequest("PATCH", `/api/students/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Student updated successfully" });
      setIsDialogOpen(false);
      setEditingStudent(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to update student", variant: "destructive" });
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
        phone: student.phone,
        address: student.address,
        joinDate: student.joinDate,
      });
    } else {
      setEditingStudent(null);
      form.reset({
        registerNo: "",
        name: "",
        phone: "",
        address: "",
        joinDate: new Date().toISOString().split("T")[0],
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: FormValues) => {
    if (editingStudent) {
      updateMutation.mutate({ ...data, id: editingStudent.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const getStatus = (expiryDate: string | null) => {
    if (!expiryDate) return "Pay Required";
    const today = new Date();
    const expiry = new Date(expiryDate);
    if (expiry < today) return "Expired";
    const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return "Pay Required";
    return "Active";
  };

  const getDaysLeft = (expiryDate: string | null) => {
    if (!expiryDate) return 0;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const canCheckIn = (expiryDate: string | null) => {
    const daysLeft = getDaysLeft(expiryDate);
    return daysLeft > 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Students</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage gym members</p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="button-add-student">
          <Plus className="mr-2 h-4 w-4" />
          Add Student
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members List</CardTitle>
          <CardDescription>View and manage all gym members</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : students && students.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Register No.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id} data-testid={`row-student-${student.id}`}>
                      <TableCell className="font-medium">{student.registerNo}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>{student.phone}</TableCell>
                      <TableCell>{student.address}</TableCell>
                      <TableCell>{new Date(student.joinDate).toLocaleDateString()}</TableCell>
                      <TableCell>{student.expiryDate ? new Date(student.expiryDate).toLocaleDateString() : "-"}</TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => attendanceMutation.mutate(student.registerNo)}
                            disabled={attendanceMutation.isPending || !canCheckIn(student.expiryDate)}
                            title={!canCheckIn(student.expiryDate) ? "Payment required to check in" : "Check in student"}
                            data-testid={`button-attendance-${student.id}`}
                          >
                            <LogIn className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(student)}
                            data-testid={`button-edit-${student.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(student.id)}
                            data-testid={`button-delete-${student.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
                    <FormLabel>Register Number <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-register-no" />
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-phone" />
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
