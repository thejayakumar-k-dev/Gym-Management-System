import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Plus,
  KeyRound,
  MoreVertical,
  Pencil,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import type { Vendor, VendorSupabaseKey } from "@shared/schema";

type AdminConfig = {
  supabaseUrl: string | null;
  anonKey: string | null;
  databaseUrl: string | null;
  serviceRoleKey: string | null;
  port: number;
};

type FormState = {
  vendorId: string;
  supabaseUrl: string;
  anonKey: string;
  databaseUrl: string;
  serviceRoleKey: string;
};

const EMPTY_FORM: FormState = {
  vendorId: "",
  supabaseUrl: "",
  anonKey: "",
  databaseUrl: "",
  serviceRoleKey: "",
};

const DEFAULT_PORT = "5000";

export default function SupabaseKeys() {
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorSupabaseKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorSupabaseKey | null>(
    null
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const { toast } = useToast();

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: keys, isLoading } = useQuery<VendorSupabaseKey[]>({
    queryKey: ["/api/vendor-supabase-keys"],
  });

  const { data: adminConfig } = useQuery<AdminConfig>({
    queryKey: ["/api/admin-supabase-config"],
  });

  const vendorName = useMemo(() => {
    const map = new Map<number, string>();
    (vendors ?? []).forEach((v) =>
      map.set(v.id, `${v.firstName} ${v.lastName}`)
    );
    return map;
  }, [vendors]);

  const filteredKeys = useMemo(() => {
    if (!keys) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) =>
      (vendorName.get(k.vendorId) ?? "").toLowerCase().includes(q)
    );
  }, [keys, search, vendorName]);

  const selectableVendors = useMemo(() => {
    const used = new Set(
      (keys ?? []).filter((k) => k.id !== editing?.id).map((k) => k.vendorId)
    );
    return (vendors ?? []).filter((v) => !used.has(v.id));
  }, [vendors, keys, editing]);

  const createMutation = useMutation({
    mutationFn: (data: {
      vendorId: number;
      supabaseUrl: string;
      anonKey: string;
      databaseUrl: string;
      serviceRoleKey: string;
      port: number;
    }) => apiRequest("POST", "/api/vendor-supabase-keys", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor-supabase-keys"],
      });
      toast({ title: "Supabase keys added successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to add supabase keys", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: number; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/vendor-supabase-keys/${vars.id}`, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor-supabase-keys"],
      });
      toast({ title: "Supabase keys updated successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to update supabase keys", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/vendor-supabase-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor-supabase-keys"],
      });
      toast({ title: "Supabase keys deleted" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Failed to delete supabase keys", variant: "destructive" });
    },
  });

  const openAddForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (key: VendorSupabaseKey) => {
    setEditing(key);
    setForm({
      vendorId: String(key.vendorId),
      supabaseUrl: "",
      anonKey: "",
      databaseUrl: "",
      serviceRoleKey: "",
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

    if (editing) {
      // Only send fields that were actually changed.
      const payload: Record<string, unknown> = {
        vendorId: Number(form.vendorId),
        port: Number(DEFAULT_PORT),
      };
      if (form.supabaseUrl.trim()) payload.supabaseUrl = form.supabaseUrl.trim();
      if (form.anonKey.trim()) payload.anonKey = form.anonKey.trim();
      if (form.databaseUrl.trim())
        payload.databaseUrl = form.databaseUrl.trim();
      if (form.serviceRoleKey.trim())
        payload.serviceRoleKey = form.serviceRoleKey.trim();

      updateMutation.mutate({ id: editing.id, data: payload });
      return;
    }

    if (
      !form.supabaseUrl.trim() ||
      !form.anonKey.trim() ||
      !form.databaseUrl.trim() ||
      !form.serviceRoleKey.trim()
    ) {
      toast({
        title: "All fields are required",
        description:
          "Fill in the Supabase URL, anon key, database URL and service role key.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      vendorId: Number(form.vendorId),
      supabaseUrl: form.supabaseUrl.trim(),
      anonKey: form.anonKey.trim(),
      databaseUrl: form.databaseUrl.trim(),
      serviceRoleKey: form.serviceRoleKey.trim(),
      port: Number(DEFAULT_PORT),
    });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Supabase Keys</h2>
          <p className="text-sm text-gray-500">
            Manage Supabase credentials for each vendor
          </p>
        </div>
        <Button
          onClick={openAddForm}
          className="bg-red-600 hover:bg-red-700 text-white"
          data-testid="button-add-supabase-key"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Keys
        </Button>
      </div>

      {/* ── Admin keys (from .env) ── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
              <ShieldCheck className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Admin (from .env)
              </p>
              <p className="text-xs text-gray-500">
                Default keys used by the admin panel
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="font-mono">
            {adminConfig ? 1 : 0}
          </Badge>
        </div>
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="font-semibold text-gray-700">
                Name
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Supabase URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Anon Key
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Database URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Service Role Key
              </TableHead>
              <TableHead className="font-semibold text-gray-700">Port</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-gray-900">Admin</TableCell>
              <TableCell className="text-sm text-gray-700 max-w-[220px] truncate">
                {adminConfig?.supabaseUrl ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-700">
                {adminConfig?.anonKey ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-700">
                {adminConfig?.databaseUrl ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-700">
                {adminConfig?.serviceRoleKey ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-700">
                {adminConfig?.port ?? 5000}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* ── Search box ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by vendor name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-white"
          data-testid="input-search-supabase-keys"
        />
      </div>

      {/* ── Keys table ── */}
      <div className="relative min-h-[300px] flex-1 overflow-auto rounded-xl border border-gray-200 bg-white [&_th]:border-r [&_th]:border-gray-200 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-100 [&_td:last-child]:border-r-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-100">
        <Table className="min-w-[820px]">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
              <TableHead className="font-semibold text-gray-700">
                Vendor Name
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Supabase URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Anon Key
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Database URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Service Role Key
              </TableHead>
              <TableHead className="font-semibold text-gray-700">Port</TableHead>
              <TableHead className="font-semibold text-gray-700 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !filteredKeys || filteredKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <KeyRound className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      {search
                        ? "No keys match your search"
                        : "No vendor keys yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-gray-400">
                        Click "Add Keys" to store Supabase credentials for a
                        vendor
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredKeys.map((key) => (
                <TableRow
                  key={key.id}
                  data-testid={`row-supabase-key-${key.id}`}
                >
                  <TableCell className="font-medium text-gray-900">
                    {vendorName.get(key.vendorId) ?? "Unknown vendor"}
                  </TableCell>
                  <TableCell className="text-sm text-gray-700 max-w-[220px] truncate">
                    {key.supabaseUrl}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {key.anonKey}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {key.databaseUrl}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {key.serviceRoleKey}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {key.port}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-gray-900"
                          data-testid={`button-supabase-key-actions-${key.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => openEditForm(key)}
                          className="cursor-pointer gap-2"
                          data-testid={`menu-edit-supabase-key-${key.id}`}
                        >
                          <Pencil className="h-4 w-4 text-gray-500" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(key)}
                          className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
                          data-testid={`menu-delete-supabase-key-${key.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-red-500" />
              {editing ? "Edit Supabase Keys" : "Add Supabase Keys"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Leave a key field blank to keep its current value."
                : "Store the Supabase credentials for the selected vendor."}
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
                <SelectTrigger data-testid="select-key-vendor">
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

            <div className="space-y-2">
              <Label>Supabase URL {editing ? "" : "*"}</Label>
              <Input
                placeholder={
                  editing ? editing.supabaseUrl : "https://xxxx.supabase.co"
                }
                value={form.supabaseUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supabaseUrl: e.target.value }))
                }
                data-testid="input-supabase-url"
              />
            </div>

            <div className="space-y-2">
              <Label>Anon Key {editing ? "" : "*"}</Label>
              <Input
                placeholder={editing ? editing.anonKey : "sb_publishable_..."}
                value={form.anonKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, anonKey: e.target.value }))
                }
                data-testid="input-anon-key"
              />
            </div>

            <div className="space-y-2">
              <Label>Database URL {editing ? "" : "*"}</Label>
              <Input
                placeholder={
                  editing ? editing.databaseUrl : "postgresql://user:pass@host:5432/db"
                }
                value={form.databaseUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, databaseUrl: e.target.value }))
                }
                data-testid="input-database-url"
              />
            </div>

            <div className="space-y-2">
              <Label>Service Role Key {editing ? "" : "*"}</Label>
              <Input
                placeholder={
                  editing ? editing.serviceRoleKey : "sb_secret_..."
                }
                value={form.serviceRoleKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, serviceRoleKey: e.target.value }))
                }
                data-testid="input-service-role-key"
              />
            </div>

            <div className="space-y-2">
              <Label>Port</Label>
              <Input value={DEFAULT_PORT} disabled className="bg-muted" />
              <p className="text-xs text-gray-400">
                Default port 5000 is used for all vendors.
              </p>
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
                data-testid="button-save-supabase-key"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Add Keys"}
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
            <DialogTitle>Delete supabase keys?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `This will remove the stored keys for ${
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
              data-testid="button-confirm-delete-supabase-key"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
