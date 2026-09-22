import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Receipt } from "lucide-react";
import type { Student } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = z.object({
  searchQuery: z.string(),
  studentId: z.number().min(1, "Please select a student"),
  date: z.string().min(1, "Date is required"),
  duration: z.number().min(1, "Duration must be at least 1 day"),
  amount: z.number().min(1, "Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "online"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function Payments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const { toast } = useToast();

  const { data: students } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      searchQuery: "",
      studentId: 0,
      date: new Date().toISOString().split("T")[0],
      duration: 0,
      amount: 0,
      paymentMethod: "cash",
    },
  });

  const filteredStudents = students?.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.registerNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paymentMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/payments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income/stats"] });
      toast({ title: "Payment recorded successfully" });
      setSelectedStudent(null);
      setSearchQuery("");
      form.reset({
        searchQuery: "",
        studentId: 0,
        date: new Date().toISOString().split("T")[0],
        duration: 0,
        amount: 0,
        paymentMethod: "cash",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to record payment";
      toast({ title: errorMessage, variant: "destructive" });
    },
  });

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    form.setValue("studentId", student.id);
    setSearchQuery(student.name);
  };

  const getNewExpiryDate = (paymentDate: string, duration: number, currentExpiry: string) => {
    const baseDate = new Date(currentExpiry) > new Date(paymentDate) ? new Date(currentExpiry) : new Date(paymentDate);
    const newDate = new Date(baseDate);
    newDate.setDate(newDate.getDate() + duration);
    return newDate;
  };

  const onSubmit = (data: FormValues) => {
    if (!selectedStudent) {
      toast({ title: "Please select a student", variant: "destructive" });
      return;
    }

    paymentMutation.mutate({
      date: data.date,
      studentId: selectedStudent.id,
      registerNo: selectedStudent.registerNo,
      studentName: selectedStudent.name,
      duration: data.duration,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
    } as any);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Record Payment</h1>
        <p className="text-sm text-muted-foreground mt-1">Process membership fee payments</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Payment Details
            </CardTitle>
            <CardDescription>Enter payment information</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="search-student">Search Student</Label>
                  <Input
                    id="search-student"
                    placeholder="Search by name or register number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-student"
                  />
                  {searchQuery && filteredStudents && filteredStudents.length > 0 && (
                    <div className="mt-2 border rounded-md max-h-40 overflow-auto">
                      {filteredStudents.slice(0, 5).map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover-elevate active-elevate-2 text-sm"
                          onClick={() => handleSelectStudent(student)}
                          data-testid={`option-student-${student.id}`}
                        >
                          <div className="font-medium">{student.name}</div>
                          <div className="text-xs text-muted-foreground">{student.registerNo}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-payment-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Membership Duration (Days) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter number of days (e.g. 30)"
                          value={field.value === 0 ? "" : field.value}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 0)}
                          data-testid="input-duration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (₹) *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            placeholder="Enter amount"
                            value={field.value === 0 ? "" : field.value}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 0)}
                            className="pl-7"
                            data-testid="input-amount"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-payment-method">
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="online">Online</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white h-11"
                  disabled={!selectedStudent || paymentMutation.isPending}
                  data-testid="button-record-payment"
                >
                  {paymentMutation.isPending ? "Recording..." : "$  Record Payment"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Membership Preview
            </CardTitle>
            <CardDescription>Preview membership details</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedStudent ? (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground">Token Number</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-500">#-</p>
                </div>

                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground">Student Name</p>
                  <p className="font-bold text-lg">{selectedStudent.name}</p>
                </div>

                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground">Register Number</p>
                  <p className="font-bold text-lg">{selectedStudent.registerNo}</p>
                </div>

                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground">Current Expiry Date</p>
                  <p className="font-bold text-lg">
                    {new Date(selectedStudent.expiryDate).toLocaleDateString() === new Date("1970-01-01").toLocaleDateString() ? "Not Set" : new Date(selectedStudent.expiryDate).toLocaleDateString()}
                  </p>
                </div>

                {form.watch("duration") > 0 && form.watch("date") && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">New Expiry Date</p>
                    <p className="font-bold text-lg text-green-900 dark:text-green-300">
                      {getNewExpiryDate(form.watch("date"), form.watch("duration"), selectedStudent.expiryDate).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      }).replace(/ /g, "-")}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      {form.watch("duration")} days from payment date
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Receipt className="h-16 w-16 mb-4 opacity-20" />
                <p>Select a student to preview membership details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
