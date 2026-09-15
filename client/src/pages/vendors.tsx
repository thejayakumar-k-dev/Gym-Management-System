import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  Pencil,
  Eye,
  Store,
  MapPin,
  Phone,
  Mail,
  CalendarDays,
  User,
  Home,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
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
import type { Vendor } from "@shared/schema";

// ── Multi-step form schema ──────────────────────────────────────────────
const formSchema = z.object({
  // Step 1 — Personal Information
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  email: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  // Step 2 — Address Details
  addressLine1: z.string().min(1, "Address line 1 is required"),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipcode: z
    .string()
    .min(1, "Zipcode is required")
    .regex(/^\d{5,6}$/, "Enter a valid zipcode (5-6 digits)"),
  areaName: z.string().min(1, "Area name is required"),
});

type FormValues = z.infer<typeof formSchema>;

const STEPS = [
  {
    id: 1,
    title: "Personal Information",
    description: "Basic contact details of the vendor",
    icon: User,
    fields: ["firstName", "lastName", "phone", "email"],
  },
  {
    id: 2,
    title: "Address Details",
    description: "Where the vendor is located",
    icon: Home,
    fields: [
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "zipcode",
      "areaName",
    ],
  },
] as const;

const EMPTY_FORM: FormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zipcode: "",
  areaName: "",
};

export default function Vendors() {
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);
  const { toast } = useToast();

  const { data: vendors, isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const filteredVendors = useMemo(() => {
    if (!vendors) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(
      (v) =>
        `${v.firstName} ${v.lastName}`.toLowerCase().includes(q) ||
        v.phone.toLowerCase().includes(q) ||
        (v.city ?? "").toLowerCase().includes(q) ||
        (v.areaName ?? "").toLowerCase().includes(q) ||
        (v.email ?? "").toLowerCase().includes(q)
    );
  }, [vendors, search]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_FORM,
    mode: "onTouched",
  });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => apiRequest("POST", "/api/vendors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({ title: "Vendor added successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to add vendor", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: FormValues & { id: number }) =>
      apiRequest("PATCH", `/api/vendors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({ title: "Vendor updated successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to update vendor", variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/vendors/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const handleToggleStatus = (vendor: Vendor) => {
    const newStatus = vendor.status === "active" ? "inactive" : "active";
    toggleStatusMutation.mutate({ id: vendor.id, status: newStatus });
  };

  const openAddForm = () => {
    setEditingVendor(null);
    form.reset(EMPTY_FORM);
    setStep(1);
    setIsFormOpen(true);
  };

  const openEditForm = (vendor: Vendor) => {
    setEditingVendor(vendor);
    form.reset({
      firstName: vendor.firstName,
      lastName: vendor.lastName,
      phone: vendor.phone,
      email: vendor.email ?? "",
      addressLine1: vendor.addressLine1 ?? "",
      addressLine2: vendor.addressLine2 ?? "",
      city: vendor.city ?? "",
      state: vendor.state ?? "",
      zipcode: vendor.zipcode ?? "",
      areaName: vendor.areaName ?? "",
    });
    setStep(1);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingVendor(null);
    setStep(1);
    form.reset();
  };

  const handleNext = async () => {
    const fields = STEPS[step - 1].fields as unknown as (keyof FormValues)[];
    const valid = await form.trigger(fields);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const onSubmit = (data: FormValues) => {
    if (editingVendor) {
      updateMutation.mutate({ id: editingVendor.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleFinalSubmit = async () => {
    const valid = await form.trigger(); // validate everything
    if (!valid) {
      // Jump back to the first step that has an error
      const errors = form.formState.errors;
      const firstBadStep = STEPS.findIndex((s) =>
        (s.fields as readonly string[]).some((f) => f in errors)
      );
      if (firstBadStep >= 0) setStep(firstBadStep + 1);
      return;
    }
    onSubmit(form.getValues());
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  // ═══════════════════════════════════════════════════════════════
  // MULTI-STEP FORM VIEW — fills the main content area only
  // (sidebar + admin top bar stay visible)
  // ═══════════════════════════════════════════════════════════════
  if (isFormOpen) {
    return (
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col"
        >
          {/* ── Form header ── */}
          <div className="shrink-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                  <Store className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 leading-tight">
                    {editingVendor ? "Edit Vendor" : "Add Vendor"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    Step {step} of {STEPS.length} — {STEPS[step - 1].title}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeForm}
                className="text-gray-500 hover:text-gray-900"
                title="Close"
                data-testid="button-close-form"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {/* Step indicator cards — inside the header box */}
            <div className="px-5 pb-4 flex items-center gap-3">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const isActive = step === s.id;
                const isDone = step > s.id;
                return (
                  <div
                    key={s.id}
                    className={`flex-1 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      isActive
                        ? "border-red-200 bg-red-50"
                        : isDone
                          ? "border-green-200 bg-green-50"
                          : "border-gray-200 bg-white"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        isActive
                          ? "bg-red-100 text-red-600"
                          : isDone
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">
                        Step {s.id}
                      </p>
                      <p
                        className={`text-sm font-semibold truncate ${
                          isActive
                            ? "text-red-700"
                            : isDone
                              ? "text-green-700"
                              : "text-gray-500"
                        }`}
                      >
                        {s.title}
                      </p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 ml-auto" />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Progress bar */}
            <div className="h-1 w-full bg-gray-100">
              <div
                className="h-full bg-red-500 transition-all duration-300"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* ── Form body ── */}
          <div className="mt-4">
            <div className="space-y-6 pb-6">
              {/* ════ STEP 1 — Personal Information ════ */}
              {step === 1 && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Personal Information
                    </h3>
                    <p className="text-sm text-gray-500">
                      Basic contact details of the vendor
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Rajesh"
                              {...field}
                              className="h-11" data-testid="input-first-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Kumar"
                              {...field}
                              className="h-11" data-testid="input-last-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number *</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="e.g. 9876543210"
                              {...field}
                              className="h-11" data-testid="input-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="e.g. vendor@example.com"
                              {...field}
                              className="h-11" data-testid="input-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              {/* ════ STEP 2 — Address Details ════ */}
              {step === 2 && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Address Details
                    </h3>
                    <p className="text-sm text-gray-500">
                      Where the vendor is located
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 1 *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. 12, Anna Salai"
                              {...field}
                              className="h-11" data-testid="input-address-line1"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 2 (optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Near bus stand"
                              {...field}
                              className="h-11" data-testid="input-address-line2"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Chennai"
                              {...field}
                              className="h-11" data-testid="input-city"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Tamil Nadu"
                              {...field}
                              className="h-11" data-testid="input-state"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="zipcode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zipcode *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. 600001"
                              {...field}
                              className="h-11" data-testid="input-zipcode"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="areaName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Area Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. T. Nagar"
                              {...field}
                              className="h-11" data-testid="input-area-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer with actions (flows right after content) ── */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-white px-5 py-3">
            <div className="flex items-center justify-between">
              <div>
                {step > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={saving}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                ) : (
                  <span className="text-xs text-gray-400 hidden sm:block">
                    Fields marked * are required
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </Button>
                {step < STEPS.length ? (
                  <Button
                    type="button"
                    onClick={handleNext}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white"
                    data-testid="button-save-vendor"
                  >
                    {saving
                      ? "Saving..."
                      : editingVendor
                        ? "Save Changes"
                        : "Add Vendor"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </Form>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VENDORS LIST VIEW
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Vendors</h2>
          <p className="text-sm text-gray-500">
            Manage gym equipment and product suppliers
          </p>
        </div>
        <Button
          onClick={openAddForm}
          className="bg-red-600 hover:bg-red-700 text-white"
          data-testid="button-add-vendor"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {/* ── Search box ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, phone, city or area..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-white"
          data-testid="input-search-vendors"
        />
      </div>

      {/* ── Vendors table (fills remaining height, scrolls internally) ── */}
      <div className="relative min-h-[300px] flex-1 overflow-auto rounded-xl border border-gray-200 bg-white [&_th]:border-r [&_th]:border-gray-200 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-100 [&_td:last-child]:border-r-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-100">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
              <TableHead className="font-semibold text-gray-700">
                Vendor Name
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Contact
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Location
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Status
              </TableHead>
              <TableHead className="font-semibold text-gray-700 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-28" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !filteredVendors || filteredVendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Store className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      {search ? "No vendors match your search" : "No vendors yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-gray-400">
                        Click "Add Vendor" to create your first vendor
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredVendors.map((vendor) => (
                <TableRow key={vendor.id} data-testid={`row-vendor-${vendor.id}`}>
                  <TableCell className="font-medium text-gray-900">
                    {vendor.firstName} {vendor.lastName}
                  </TableCell>
                  <TableCell className="text-gray-600">{vendor.phone}</TableCell>
                  <TableCell className="text-gray-600">
                    {[vendor.areaName, vendor.city].filter(Boolean).join(", ") ||
                      "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        vendor.status === "active"
                          ? "bg-green-100 text-green-700 hover:bg-green-100 border border-green-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200"
                      }
                      data-testid={`badge-status-${vendor.id}`}
                    >
                      {vendor.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-gray-900"
                        onClick={() => setViewingVendor(vendor)}
                        title="View details"
                        data-testid={`button-view-${vendor.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-red-600"
                        onClick={() => openEditForm(vendor)}
                        title="Edit vendor"
                        data-testid={`button-edit-${vendor.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-1.5 pl-1">
                        <Switch
                          checked={vendor.status === "active"}
                          onCheckedChange={() => handleToggleStatus(vendor)}
                          disabled={toggleStatusMutation.isPending}
                          data-testid={`switch-status-${vendor.id}`}
                        />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── View details dialog (small popup is fine here) ── */}
      <Dialog
        open={!!viewingVendor}
        onOpenChange={(open) => !open && setViewingVendor(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-red-500" />
              {viewingVendor?.firstName} {viewingVendor?.lastName}
            </DialogTitle>
            <DialogDescription>Vendor details</DialogDescription>
          </DialogHeader>

          {viewingVendor && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                      Phone
                    </p>
                    <p className="text-sm text-gray-900">
                      {viewingVendor.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                      Email
                    </p>
                    <p className="text-sm text-gray-900">
                      {viewingVendor.email || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                      Address
                    </p>
                    <p className="text-sm text-gray-900">
                      {[
                        viewingVendor.addressLine1,
                        viewingVendor.addressLine2,
                        viewingVendor.areaName,
                        viewingVendor.city,
                        viewingVendor.state,
                        viewingVendor.zipcode,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarDays className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                      Added On
                    </p>
                    <p className="text-sm text-gray-900">
                      {new Date(viewingVendor.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                  Status
                </span>
                <Badge
                  className={
                    viewingVendor.status === "active"
                      ? "bg-green-100 text-green-700 hover:bg-green-100 border border-green-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-100 border border-gray-200"
                  }
                >
                  {viewingVendor.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
