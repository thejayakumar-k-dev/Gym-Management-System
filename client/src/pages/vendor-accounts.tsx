import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Wallet,
  MoreVertical,
  Pencil,
  Trash2,
  CalendarClock,
  Phone,
  Mail,
  History,
  DollarSign,
  FileText,
  RefreshCw,
  Ban,
  X,
} from "lucide-react";
import type {
  Vendor,
  VendorAccount,
  VendorServiceChargeSummary,
} from "@shared/schema";

type FormState = {
  vendorId: string;
  availableDays: string;
  creditDays: string;
};

type AddDaysFormState = {
  vendorId: string;
  balanceDays: string;
  paymentType: string;
};

const EMPTY_FORM: FormState = {
  vendorId: "",
  availableDays: "",
  creditDays: "",
};

const EMPTY_ADD_DAYS_FORM: AddDaysFormState = {
  vendorId: "",
  balanceDays: "",
  paymentType: "cash",
};

export default function VendorAccounts() {
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorAccount | null>(null);
  const [addDaysOpen, setAddDaysOpen] = useState(false);
  const [addDaysMode, setAddDaysMode] = useState<"days" | "credits">("days");
  const [addDaysForm, setAddDaysForm] = useState<AddDaysFormState>(EMPTY_ADD_DAYS_FORM);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [serviceVendorId, setServiceVendorId] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState<{
    method: "per_user" | "fixed";
    perUserCharge: string;
    defaultPrice: string;
    platformFee: string;
  }>({
    method: "per_user",
    perUserCharge: "1",
    defaultPrice: "199",
    platformFee: "999",
  });
  const { toast } = useToast();

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: accounts, isLoading } = useQuery<VendorAccount[]>({
    queryKey: ["/api/vendor-accounts"],
  });

  const { data: serviceCharge, isLoading: serviceChargeLoading } =
    useQuery<VendorServiceChargeSummary>({
      queryKey: ["/api/vendor-service-charge", serviceVendorId],
      enabled: serviceVendorId != null,
    });

  useEffect(() => {
    if (!serviceCharge) return;
    setServiceForm({
      method: serviceCharge.method,
      perUserCharge: String(serviceCharge.perUserCharge),
      defaultPrice: String(serviceCharge.defaultPrice),
      platformFee: String(serviceCharge.platformFee),
    });
  }, [serviceCharge]);

  const vendorName = useMemo(() => {
    const map = new Map<number, string>();
    (vendors ?? []).forEach((v) =>
      map.set(v.id, `${v.firstName} ${v.lastName}`)
    );
    return map;
  }, [vendors]);

  // Build a merged list: every vendor with account data if available, or defaults
  const allVendorAccounts = useMemo(() => {
    if (!vendors) return undefined;
    const accountByVendor = new Map<number, VendorAccount>();
    (accounts ?? []).forEach((a) => accountByVendor.set(a.vendorId, a));
    return vendors.map((v) => {
      const existing = accountByVendor.get(v.id);
      return {
        vendor: v,
        account: existing ?? null,
        availableDays: existing?.availableDays ?? 0,
        creditDays: existing?.creditDays ?? 0,
        usedCredits: existing?.usedCredits ?? 0,
        hasAccount: !!existing,
      };
    });
  }, [vendors, accounts]);

  const filteredAccounts = useMemo(() => {
    if (!allVendorAccounts) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return allVendorAccounts;
    return allVendorAccounts.filter((row) =>
      `${row.vendor.firstName} ${row.vendor.lastName}`.toLowerCase().includes(q)
    );
  }, [allVendorAccounts, search]);

  // Vendors that don't already have an account (keep the one being edited).
  const selectableVendors = useMemo(() => {
    const used = new Set(
      (accounts ?? [])
        .filter((a) => a.id !== editing?.id)
        .map((a) => a.vendorId)
    );
    return (vendors ?? []).filter((v) => !used.has(v.id));
  }, [vendors, accounts, editing]);

  const createMutation = useMutation({
    mutationFn: (data: {
      vendorId: number;
      availableDays: number;
      creditDays: number;
      usedCredits: number;
    }) => apiRequest("POST", "/api/vendor-accounts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-accounts"] });
      toast({ title: "Vendor account added successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to add vendor account", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      vendorId: number;
      availableDays: number;
      creditDays: number;
      usedCredits: number;
    }) => apiRequest("PATCH", `/api/vendor-accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-accounts"] });
      toast({ title: "Vendor account updated successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to update vendor account", variant: "destructive" });
    },
  });

  // Dedicated mutations for the Add Days / Update Credits dialog.
  // These use separate mutations from the main form so their onSuccess
  // only closes the add-days dialog, not the main account dialog.

  /**
   * Radix UI Dialog adds scroll-lock styles and a FocusScope to document.body
   * while open. If cleanup is interrupted (e.g. by a React re-render mid-animation
   * or when opened from a DropdownMenu), the body can be left with pointer-events:none,
   * completely freezing the UI. This helper reliably restores the body.
   */
  const forceRestoreBody = () => {
    const restore = () => {
      if (!document.querySelector('[role="dialog"]')) {
        document.body.style.pointerEvents = "";
        document.body.style.overflow = "";
        document.body.removeAttribute("data-scroll-locked");
      }
    };
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 0);
    setTimeout(restore, 50);
    setTimeout(restore, 150);
    setTimeout(restore, 300);
  };

  useEffect(() => {
    if (!addDaysOpen && !isFormOpen && !deleteTarget) {
      forceRestoreBody();
    }
  }, [addDaysOpen, isFormOpen, deleteTarget]);

  const addDaysCreateMutation = useMutation({
    mutationFn: (data: {
      vendorId: number;
      availableDays: number;
      creditDays: number;
      usedCredits: number;
    }) => apiRequest("POST", "/api/vendor-accounts", data),
    onSuccess: () => {
      setAddDaysOpen(false);
      setAddDaysForm(EMPTY_ADD_DAYS_FORM);
      forceRestoreBody();
      toast({ title: "Saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-accounts"] });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const addDaysUpdateMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      vendorId: number;
      availableDays: number;
      creditDays: number;
      usedCredits: number;
    }) => apiRequest("PATCH", `/api/vendor-accounts/${id}`, data),
    onSuccess: () => {
      setAddDaysOpen(false);
      setAddDaysForm(EMPTY_ADD_DAYS_FORM);
      forceRestoreBody();
      toast({ title: "Saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-accounts"] });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/vendor-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-accounts"] });
      toast({ title: "Vendor account deleted" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Failed to delete vendor account", variant: "destructive" });
    },
  });

  const saveServiceChargeMutation = useMutation({
    mutationFn: ({
      vendorId,
      data,
    }: {
      vendorId: number;
      data: {
        method: "per_user" | "fixed";
        perUserCharge: number;
        defaultPrice: number;
        platformFee: number;
      };
    }) => apiRequest("PUT", `/api/vendor-service-charge/${vendorId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-service-charge"] });
      toast({ title: "Service charge plan saved" });
    },
    onError: () => {
      toast({
        title: "Failed to save service charge plan",
        variant: "destructive",
      });
    },
  });

  const openAddDaysForm = (vendorId: number) => {
    setAddDaysMode("days");
    setAddDaysForm({ vendorId: String(vendorId), balanceDays: "", paymentType: "cash" });
    setAddDaysOpen(true);
  };

  const openCreditsForm = (vendorId: number) => {
    setAddDaysMode("credits");
    setAddDaysForm({ vendorId: String(vendorId), balanceDays: "", paymentType: "cash" });
    setAddDaysOpen(true);
  };

  const openServicePlan = (vendorId: number) => {
    setServiceVendorId(vendorId);
  };

  const openEditForm = (account: VendorAccount) => {
    setEditing(account);
    setForm({
      vendorId: String(account.vendorId),
      availableDays: String(account.availableDays),
      creditDays: String(account.creditDays),
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorId) {
      toast({ title: "Please select a vendor", variant: "destructive" });
      return;
    }

    const availableDays = Number(form.availableDays || 0);
    const creditDays = Number(form.creditDays || 0);

    if (!Number.isInteger(availableDays) || availableDays < 0) {
      toast({
        title: "Available days must be a positive number",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isInteger(creditDays) || creditDays < 0) {
      toast({
        title: "Credit days must be a positive number",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      vendorId: Number(form.vendorId),
      availableDays,
      creditDays,
      // keep consumed credits when editing; fresh accounts start at 0
      usedCredits: editing ? editing.usedCredits : 0,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  const serviceVendorName =
    serviceVendorId != null ? vendorName.get(serviceVendorId) ?? "Vendor" : "";

  const scUsers = serviceCharge?.userCount ?? 0;
  const scPerUser = Number(serviceForm.perUserCharge || 0);
  const scDefault = Number(serviceForm.defaultPrice || 0);
  const scPlatform = Number(serviceForm.platformFee || 0);
  const scServiceCharge =
    serviceForm.method === "fixed"
      ? scDefault
      : Math.max(scUsers * scPerUser, scDefault);
  const scTotal = scServiceCharge + scPlatform;

  const handleSaveServicePlan = () => {
    if (serviceVendorId == null) return;
    saveServiceChargeMutation.mutate({
      vendorId: serviceVendorId,
      data: {
        method: serviceForm.method,
        perUserCharge: Math.max(0, Math.floor(scPerUser)),
        defaultPrice: Math.max(0, Math.floor(scDefault)),
        platformFee: Math.max(0, Math.floor(scPlatform)),
      },
    });
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Vendor Accounts</h2>
          <p className="text-sm text-gray-500">
            Manage available and credit days for each vendor
          </p>
        </div>
        </div>

      {/* ── Search box ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by vendor name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-white"
          data-testid="input-search-vendor-accounts"
        />
      </div>

      {/* ── Accounts table ── */}
      <div className="relative min-h-[300px] flex-1 overflow-auto rounded-xl border border-gray-200 bg-white [&_th]:border-r [&_th]:border-gray-200 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-100 [&_td:last-child]:border-r-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-100">
        <Table className="min-w-[720px]">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
              <TableHead className="font-semibold text-gray-700">
                Vendor Name
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Contact
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Available Days
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Outstanding
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Allow Credit Days
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
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-28" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !filteredAccounts || filteredAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Wallet className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      {search
                        ? "No accounts match your search"
                        : "No vendor accounts yet"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAccounts.map((row) => (
                <TableRow
                  key={row.vendor.id}
                  data-testid={`row-vendor-account-${row.vendor.id}`}
                >
                  <TableCell>
                    {row.vendor.businessName && (
                      <div className="text-sm font-semibold text-gray-900">
                        {row.vendor.businessName}
                      </div>
                    )}
                    <div className={`text-sm ${row.vendor.businessName ? 'text-gray-500' : 'font-medium text-gray-900'}`}>
                      {row.vendor.firstName} {row.vendor.lastName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-900">{row.vendor.phone}</div>
                    {row.vendor.email && (
                      <div className="text-xs text-gray-500">{row.vendor.email}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border border-blue-200">
                      <CalendarClock className="h-3 w-3 mr-1" />
                      {row.availableDays} days
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* Outstanding = consumed credit days: 6/7 → 1, 4/7 → 3, 0/7 → 7 */}
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border border-red-200">
                      {Math.min(row.usedCredits, row.creditDays)} days
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const remaining = Math.max(row.creditDays - row.usedCredits, 0);
                      const total = row.creditDays;
                      const hasAvailableDays = row.availableDays > 0;
                      const isBlocked = !hasAvailableDays && (total === 0 || remaining === 0);
                      if (isBlocked) {
                        return (
                          <Badge
                            className="bg-red-600 text-white hover:bg-red-600 border border-red-700"
                            data-testid={`badge-credit-blocked-${row.vendor.id}`}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            Account Blocked
                          </Badge>
                        );
                      }
                      return (
                        <Badge
                          className={
                            remaining <= 2
                              ? "bg-orange-100 text-orange-700 hover:bg-orange-100 border border-orange-200"
                              : "bg-amber-100 text-amber-700 hover:bg-amber-100 border border-amber-200"
                          }
                          data-testid={`badge-credit-count-${row.vendor.id}`}
                        >
                          {remaining}/{total} days
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-gray-900 relative z-30"
                          data-testid={`button-account-actions-${row.vendor.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 z-50">
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          data-testid={`menu-view-history-${row.vendor.id}`}
                        >
                          <History className="h-4 w-4 text-gray-500" />
                          View History
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => openAddDaysForm(row.vendor.id)}
                          onClick={() => openAddDaysForm(row.vendor.id)}
                          className="cursor-pointer gap-2"
                          data-testid={`menu-update-days-${row.vendor.id}`}
                        >
                          <RefreshCw className="h-4 w-4 text-gray-500" />
                          Update Days
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => openCreditsForm(row.vendor.id)}
                          onClick={() => openCreditsForm(row.vendor.id)}
                          className="cursor-pointer gap-2"
                          data-testid={`menu-update-credits-${row.vendor.id}`}
                        >
                          <Pencil className="h-4 w-4 text-gray-500" />
                          Update Allow Credits
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openServicePlan(row.vendor.id)}
                          className="cursor-pointer gap-2"
                          data-testid={`menu-service-charge-${row.vendor.id}`}
                        >
                          <DollarSign className="h-4 w-4 text-gray-500" />
                          Service Charge Plan
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          data-testid={`menu-invoices-${row.vendor.id}`}
                        >
                          <FileText className="h-4 w-4 text-gray-500" />
                          Platform Invoices
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Add / Edit dialog ── */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-red-500" />
              {editing ? "Edit Vendor Account" : "Add Vendor Account"}
            </DialogTitle>
            <DialogDescription>
              Set the available and credit days for the vendor.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Select
                value={form.vendorId}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, vendorId: value }))
                }
              >
                <SelectTrigger data-testid="select-vendor">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {selectableVendors.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      No vendors available
                    </div>
                  ) : (
                    selectableVendors.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.firstName} {v.lastName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Available Days *</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 30"
                  value={form.availableDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, availableDays: e.target.value }))
                  }
                  data-testid="input-available-days"
                />
              </div>
              <div className="space-y-2">
                <Label>Allow Credit Days *</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 7"
                  value={form.creditDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, creditDays: e.target.value }))
                  }
                  data-testid="input-credit-days"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-save-vendor-account"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Add Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete vendor account?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `This will remove the account for ${
                    vendorName.get(deleteTarget.vendorId) ?? "this vendor"
                  }. This action cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-account"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Account Days dialog ── */}
      <Dialog
        open={addDaysOpen}
        onOpenChange={(open) => {
          if (!open && !addDaysUpdateMutation.isPending && !addDaysCreateMutation.isPending) {
            setAddDaysOpen(false);
            forceRestoreBody();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-red-500" />
              {addDaysMode === "credits" ? "Update Credit Days" : "Add Account Days"}
            </DialogTitle>
            <DialogDescription>
              {addDaysMode === "credits"
                ? "Set credit days and payment type for this vendor."
                : "Add balance days and payment type for this vendor."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={(() => {
                  const v = (vendors ?? []).find((v) => String(v.id) === addDaysForm.vendorId);
                  return v ? (v.businessName || `${v.firstName} ${v.lastName}`) : '';
                })()
                }
                readOnly
                className="bg-gray-50 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>{addDaysMode === "credits" ? "Credit Days" : "Available Days"} *</Label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 30"
                value={addDaysForm.balanceDays}
                onChange={(e) =>
                  setAddDaysForm((f) => ({ ...f, balanceDays: e.target.value }))
                }
                data-testid="input-balance-days"
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Type *</Label>
              <Select
                value={addDaysForm.paymentType}
                onValueChange={(value) =>
                  setAddDaysForm((f) => ({ ...f, paymentType: value }))
                }
              >
                <SelectTrigger data-testid="select-payment-type">
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="gpay">GPay</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAddDaysOpen(false);
                forceRestoreBody();
              }}
              disabled={addDaysUpdateMutation.isPending || addDaysCreateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addDaysUpdateMutation.isPending || addDaysCreateMutation.isPending}
              onClick={() => {
                const days = Number(addDaysForm.balanceDays || 0);
                if (!days || days <= 0) {
                  toast({ title: "Enter valid days", variant: "destructive" });
                  return;
                }
                const vendorId = Number(addDaysForm.vendorId);
                const existingAccount = (accounts ?? []).find((a) => a.vendorId === vendorId);
                if (addDaysMode === "credits") {
                  // granting a fresh credit allowance resets the counter to N/N
                  const payload = {
                    vendorId,
                    availableDays: existingAccount?.availableDays ?? 0,
                    creditDays: days,
                    usedCredits: 0,
                  };
                  if (existingAccount) {
                    addDaysUpdateMutation.mutate({ id: existingAccount.id, ...payload });
                  } else {
                    addDaysCreateMutation.mutate(payload);
                  }
                } else {
                  // When adding available days:
                  // 1. Reduce outstanding credits from new available days
                  // 2. Renew credit days to match
                  // 3. Reset used credits
                  const outstanding = existingAccount?.usedCredits ?? 0;
                  const adjustedDays = Math.max(days - outstanding, 0);
                  const payload = {
                    vendorId,
                    availableDays: adjustedDays,
                    creditDays: days,
                    usedCredits: 0,
                  };
                  if (existingAccount) {
                    addDaysUpdateMutation.mutate({ id: existingAccount.id, ...payload });
                  } else {
                    addDaysCreateMutation.mutate(payload);
                  }
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-save-add-days"
            >
              {addDaysUpdateMutation.isPending || addDaysCreateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Service Charge Plan (full screen within content area) ── */}
      {serviceVendorId != null && (
        <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-500" />
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Service Charge Plan
                </h3>
                <p className="text-xs text-gray-500">
                  {serviceVendorName
                    ? "Set the platform fee and service charge for " +
                      serviceVendorName +
                      "."
                    : "Set the platform fee and service charge for this vendor."}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setServiceVendorId(null)}
              aria-label="Close"
              data-testid="button-close-service-charge"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {serviceChargeLoading ? (
              <div className="mx-auto max-w-3xl space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-5">
                <div className="space-y-2">
                  <Label>Service Charge Method</Label>
                  <Select
                    value={serviceForm.method}
                    onValueChange={(value) =>
                      setServiceForm((f) => ({
                        ...f,
                        method: value as "per_user" | "fixed",
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-service-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_user">Per User</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Per User Charge (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={serviceForm.perUserCharge}
                      disabled={serviceForm.method === "fixed"}
                      onChange={(e) =>
                        setServiceForm((f) => ({
                          ...f,
                          perUserCharge: e.target.value,
                        }))
                      }
                      data-testid="input-per-user-charge"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Price (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={serviceForm.defaultPrice}
                      onChange={(e) =>
                        setServiceForm((f) => ({
                          ...f,
                          defaultPrice: e.target.value,
                        }))
                      }
                      data-testid="input-default-price"
                    />
                  </div>
                  <div className="space-y-2">
                      <Label>Platform Fee (₹, all vendors)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={serviceForm.platformFee}
                      onChange={(e) =>
                        setServiceForm((f) => ({
                          ...f,
                          platformFee: e.target.value,
                        }))
                      }
                      data-testid="input-platform-fee"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-gray-500">
                      Users (from vendor database)
                    </span>
                    <span className="font-medium text-gray-900">
                      {serviceCharge?.hasKeys ? scUsers : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-gray-500">
                      {serviceForm.method === "fixed"
                        ? "Service charge (fixed)"
                        : "Service charge (" +
                          scUsers +
                          " × ₹" +
                          scPerUser +
                          ", min ₹" +
                          scDefault +
                          ")"}
                    </span>
                    <span className="font-medium text-gray-900">
                      ₹{scServiceCharge}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-gray-500">Platform fee (global)</span>
                    <span className="font-medium text-gray-900">
                      ₹{scPlatform}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-2">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="font-bold text-red-600">₹{scTotal}</span>
                  </div>
                  {!serviceCharge?.hasKeys && (
                    <p className="mt-2 text-xs text-amber-600">
                      No Neon project configured for this vendor — user count is
                      unavailable, showing the minimum charge.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setServiceVendorId(null)}
              disabled={saveServiceChargeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveServicePlan}
              disabled={
                saveServiceChargeMutation.isPending || serviceChargeLoading
              }
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-save-service-charge"
            >
              {saveServiceChargeMutation.isPending ? "Saving..." : "Save Plan"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
