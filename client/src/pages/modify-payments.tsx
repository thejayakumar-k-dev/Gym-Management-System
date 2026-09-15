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
import { Pencil, Trash2, History, Banknote, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Payment } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const editPaymentSchema = z.object({
  date: z.string().min(1, "Date is required"),
  duration: z.number().min(1, "Duration must be at least 1 day"),
  amount: z.number().min(1, "Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "online"]),
});

type EditPaymentValues = z.infer<typeof editPaymentSchema>;

export default function ModifyPayments() {
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: payments, isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });

  const form = useForm<EditPaymentValues>({
    resolver: zodResolver(editPaymentSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      duration: 0,
      amount: 0,
      paymentMethod: "cash",
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: EditPaymentValues & { id: number }) =>
      apiRequest("PATCH", `/api/payments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Payment updated successfully" });
      setIsDialogOpen(false);
      setEditingPayment(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to update payment", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Payment deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete payment", variant: "destructive" });
    },
  });

  const handleOpenDialog = (payment: Payment) => {
    setEditingPayment(payment);
    form.reset({
      date: payment.date,
      duration: payment.duration,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod as "cash" | "online",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: EditPaymentValues) => {
    if (editingPayment) {
      updateMutation.mutate({ ...data, id: editingPayment.id });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Modify Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">Edit or delete payment records</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment Records</CardTitle>
          <CardDescription>Click edit to modify or delete payments</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : payments && payments.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Register No.</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                      <TableCell className="font-medium">{payment.tokenNumber}</TableCell>
                      <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                      <TableCell>{payment.studentName}</TableCell>
                      <TableCell>{payment.registerNo}</TableCell>
                      <TableCell>{payment.duration} days</TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(payment)}
                            data-testid={`button-edit-${payment.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(payment.id)}
                            data-testid={`button-delete-${payment.id}`}
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
              <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No payment records found</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent data-testid="dialog-edit-payment">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>
              Update payment details for {editingPayment?.studentName}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        placeholder="Enter number of days"
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

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {updateMutation.isPending ? "Updating..." : "Update Payment"}
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
            <DialogDescription>Are you sure you want to delete this payment? This action cannot be undone.</DialogDescription>
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
    </div>
  );
}
