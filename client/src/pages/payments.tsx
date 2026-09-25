import { useState, useEffect, useRef, type KeyboardEvent } from "react";
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
import type { Student, MembershipPlan } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { addMonths, calculatePlanPrice } from "@shared/duration";
import { formatDate } from "@/lib/format";
import { useReadOnly } from "@/lib/read-only";
import { DurationPicker } from "@/components/duration-picker";

const formSchema = z.object({
  searchQuery: z.string(),
  studentId: z.number().min(1, "Please select a student"),
  date: z.string().min(1, "Date is required"),
  duration: z.number().min(1, "Duration must be at least 1 month"),
  amount: z.number().min(1, "Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "online"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function Payments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  // Admin viewing this vendor's panel in Read Only mode — payments can't be recorded.
  const readOnly = useReadOnly();
  const [tokenNumber, setTokenNumber] = useState<string | null>(null);
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
      duration: 1,
      amount: 0,
      paymentMethod: "cash",
    },
  });

  const { data: plans } = useQuery<MembershipPlan[]>({
    queryKey: ["/api/membership-plans"],
  });

  const watchedDuration = form.watch("duration");

  // Auto-fill the amount from the Membership Plans tab prices.
  useEffect(() => {
    const price = calculatePlanPrice(plans ?? [], watchedDuration);
    if (price > 0) {
      form.setValue("amount", price);
    }
  }, [watchedDuration, plans]);

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
      setTokenNumber(null);
      form.reset({
        searchQuery: "",
        studentId: 0,
        date: new Date().toISOString().split("T")[0],
        duration: 1,
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
    setTokenNumber(`TKN-${Date.now()}`);
  };

  // Enter in the search box picks the member: an exact member-ID match wins,
  // then an exact name match, then the top suggestion. It also stops the
  // <form> from doing an implicit submit, which previously fired validation
  // with no member selected and silently did nothing.
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (selectedStudent || !searchQuery.trim()) return;

    if (!filteredStudents || filteredStudents.length === 0) {
      toast({ title: "No member found", variant: "destructive" });
      return;
    }

    const query = searchQuery.trim().toLowerCase();
    const match =
      filteredStudents.find((s) => s.registerNo.toLowerCase() === query) ||
      filteredStudents.find((s) => s.name.toLowerCase() === query) ||
      filteredStudents[0];

    handleSelectStudent(match);
  };

  // Deep link from the dashboard's "Pay Now" button:
  // /payments?student=<registerNo> pre-selects that member so staff land on the
  // payment form with the expired member already loaded. The parameter is
  // consumed once so a refresh or a second payment isn't hijacked by it.
  const appliedStudentParam = useRef(false);
  useEffect(() => {
    if (appliedStudentParam.current || !students || selectedStudent) return;

    const target = new URLSearchParams(window.location.search).get("student");
    if (!target) return;

    appliedStudentParam.current = true;
    const match = students.find(
      (s) => s.registerNo === target || String(s.id) === target
    );
    if (match) {
      handleSelectStudent(match);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [students, selectedStudent]);

  const getNewExpiryDate = (paymentDate: string, duration: number, currentExpiry?: string | null) => {
    const baseDate = currentExpiry && new Date(currentExpiry) > new Date(paymentDate) ? new Date(currentExpiry) : new Date(paymentDate);
    return addMonths(baseDate, duration);
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
      tokenNumber: tokenNumber || undefined,
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
                    placeholder={
                      selectedStudent
                        ? "Member selected"
                        : "Search by name or member ID..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    disabled={!!selectedStudent}
                    className={
                      selectedStudent
                        ? "bg-muted font-medium text-foreground"
                        : ""
                    }
                    data-testid="input-search-student"
                  />
                  {searchQuery &&
                    (!selectedStudent || searchQuery !== selectedStudent.name) &&
                    filteredStudents &&
                    filteredStudents.length > 0 && (
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
                      <DurationPicker value={field.value} onChange={field.onChange} />
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

                {!readOnly && (
                  <Button
                    type="submit"
                    className="w-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white h-11"
                    disabled={!selectedStudent || paymentMutation.isPending}
                    data-testid="button-record-payment"
                  >
                    {paymentMutation.isPending ? "Recording..." : "Record Payment"}
                  </Button>
                )}
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
                  <p className="text-xs text-muted-foreground">Member ID</p>
                  <p className="font-bold text-lg">{selectedStudent.registerNo}</p>
                </div>

                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground">Student Name</p>
                  <p className="font-bold text-lg">{selectedStudent.name}</p>
                </div>

                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground">Token Number</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-500">
                    {tokenNumber ?? "#-"}
                  </p>
                </div>

                {form.watch("duration") > 0 && form.watch("date") && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">Membership Expiry Date</p>
                    <p className="font-bold text-lg text-green-900 dark:text-green-300">
                      {formatDate(
                        getNewExpiryDate(
                          form.watch("date"),
                          form.watch("duration"),
                          selectedStudent.expiryDate
                        )
                      )}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      {form.watch("duration") === 1
                        ? "1 month from payment date"
                        : `${form.watch("duration")} months from payment date`}
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
