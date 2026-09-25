import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Crown,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { MembershipPlan } from "@shared/schema";
import { useReadOnly } from "@/lib/read-only";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const planFormSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  durationMonths: z.coerce
    .number({ invalid_type_error: "Duration is required" })
    .int("Duration must be whole months")
    .min(1, "Minimum 1 month")
    .max(120, "Maximum 120 months"),
  price: z.coerce
    .number({ invalid_type_error: "Price is required" })
    .int("Price must be a whole number")
    .min(0, "Price cannot be negative"),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

// Every plan tile uses the same brand tint so the list reads as one set.
const TILE_TILE_CLASS = "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10";
const TILE_ICON_CLASS = "h-5 w-5 text-primary";

function durationLabel(months: number): string {
  if (months === 12) return "1 Year";
  if (months % 12 === 0 && months > 12) return `${months / 12} Years`;
  return months === 1 ? "1 Month" : `${months} Months`;
}

export default function MembershipPlans({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Admin viewing this vendor's panel in Read Only mode — plans are untouchable.
  const readOnly = useReadOnly();

  const { data: plans, isLoading } = useQuery<MembershipPlan[]>({
    queryKey: ["/api/membership-plans"],
  });

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: "",
      durationMonths: 1,
      price: 0,
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/membership-plans"] });

  const onError = (error: any) =>
    toast({
      title: error?.message || "Something went wrong",
      variant: "destructive",
    });

  const saveMutation = useMutation({
    mutationFn: (values: PlanFormValues) =>
      editingPlan
        ? apiRequest("PUT", `/api/membership-plans/${editingPlan.id}`, values)
        : apiRequest("POST", "/api/membership-plans", values),
    onSuccess: () => {
      invalidate();
      toast({ title: editingPlan ? "Plan updated" : "Plan added" });
      setIsDialogOpen(false);
      setEditingPlan(null);
      form.reset({ name: "", durationMonths: 1, price: 0 });
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/membership-plans/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteId(null);
      toast({ title: "Plan deleted" });
    },
    onError,
  });

  const openAdd = () => {
    setEditingPlan(null);
    form.reset({ name: "", durationMonths: 1, price: 0 });
    setIsDialogOpen(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    form.reset({
      name: plan.name,
      durationMonths: plan.durationMonths,
      price: plan.price,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Membership Plans
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Set membership duration and price for your gym. These prices will
              be used while recording payments.
            </p>
          </div>
        </div>

        {!readOnly && (
          <Button
            onClick={openAdd}
            className="gap-2 shrink-0"
            data-testid="button-add-plan"
          >
            <Plus className="h-4 w-4" />
            Add Membership Plan
          </Button>
        )}
      </div>

      {/* Plan list */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : plans && plans.length > 0 ? (
        <div className="space-y-4">
          {plans.map((plan) => {
            return (
              <div
                key={plan.id}
                className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center"
                data-testid={`plan-row-${plan.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={TILE_TILE_CLASS}>
                    <Calendar className={TILE_ICON_CLASS} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-lg text-foreground truncate">
                      {plan.name}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {durationLabel(plan.durationMonths)} membership
                    </p>
                  </div>
                </div>

                <div className="sm:w-28">
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="text-sm font-medium text-foreground">
                    {durationLabel(plan.durationMonths)}
                  </p>
                </div>

                <div className="sm:w-32">
                  <p className="text-xs text-muted-foreground">Amount (₹)</p>
                  <p className="text-lg font-bold text-foreground">
                    ₹ {plan.price.toLocaleString("en-IN")}
                  </p>
                </div>

                <div className="flex items-center gap-2 sm:ml-auto">
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(plan)}
                      title="Edit membership plan"
                      data-testid={`button-edit-plan-${plan.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {isAdmin && !readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirmDeleteId === plan.id) {
                          deleteMutation.mutate(plan.id);
                        } else {
                          setConfirmDeleteId(plan.id);
                        }
                      }}
                      title={confirmDeleteId === plan.id ? "Confirm delete membership plan" : "Delete membership plan"}
                      data-testid={`button-delete-plan-${plan.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No membership plans yet.</p>
          {!readOnly && (
            <Button
              onClick={openAdd}
              className="mt-4 gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Membership Plan
            </Button>
          )}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingPlan(null);
        }}
      >
        <DialogContent data-testid="dialog-plan-form">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? "Edit Membership Plan" : "Add Membership Plan"}
            </DialogTitle>
            <DialogDescription>
              Set the duration and price used when recording payments.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 6 Months"
                        {...field}
                        data-testid="input-plan-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="durationMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (Months) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                          data-testid="input-plan-duration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (₹) *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            ₹
                          </span>
                          <Input
                            type="number"
                            min={0}
                            className="pl-7"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value)}
                            data-testid="input-plan-price"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="button-submit-plan"
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : editingPlan
                      ? "Save Changes"
                      : "Add Plan"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
