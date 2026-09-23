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
import type { Vendor, VendorNeonProject } from "@shared/schema";

type AdminConfig = {
  authUrl: string | null;
  apiKey: string | null;
  databaseUrl: string | null;
  authSecret: string | null;
  port: number;
};

type FormState = {
  vendorId: string;
  projectName: string;
  authUrl: string;
  apiKey: string;
  databaseUrl: string;
  authSecret: string;
};

const EMPTY_FORM: FormState = {
  vendorId: "",
  projectName: "",
  authUrl: "",
  apiKey: "",
  databaseUrl: "",
  authSecret: "",
};

const DEFAULT_PORT = "5000";

export default function NeonProjects() {
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorNeonProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorNeonProject | null>(
    null
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const { toast } = useToast();

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: projects, isLoading } = useQuery<VendorNeonProject[]>({
    queryKey: ["/api/vendor-neon-projects"],
  });

  const { data: adminConfig } = useQuery<AdminConfig>({
    queryKey: ["/api/admin-neon-config"],
  });

  const vendorName = useMemo(() => {
    const map = new Map<number, string>();
    (vendors ?? []).forEach((v) =>
      map.set(v.id, `${v.firstName} ${v.lastName}`)
    );
    return map;
  }, [vendors]);

  const filteredProjects = useMemo(() => {
    if (!projects) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      (vendorName.get(p.vendorId) ?? "").toLowerCase().includes(q)
    );
  }, [projects, search, vendorName]);

  const selectableVendors = useMemo(() => {
    const used = new Set(
      (projects ?? [])
        .filter((p) => p.id !== editing?.id)
        .map((p) => p.vendorId)
    );
    return (vendors ?? []).filter((v) => !used.has(v.id));
  }, [vendors, projects, editing]);

  const createMutation = useMutation({
    mutationFn: (data: { vendorId: number; projectName?: string }) =>
      apiRequest("POST", "/api/vendor-neon-projects", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor-neon-projects"],
      });
      toast({ title: "Neon project added successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to add Neon project", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: number; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/vendor-neon-projects/${vars.id}`, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor-neon-projects"],
      });
      toast({ title: "Neon project updated successfully" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to update Neon project", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/vendor-neon-projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor-neon-projects"],
      });
      toast({ title: "Neon project deleted" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Failed to delete Neon project", variant: "destructive" });
    },
  });

  const openAddForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (project: VendorNeonProject) => {
    setEditing(project);
    setForm({
      vendorId: String(project.vendorId),
      projectName: "",
      authUrl: "",
      apiKey: "",
      databaseUrl: "",
      authSecret: "",
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
      const payload: Record<string, unknown> = {
        vendorId: Number(form.vendorId),
        port: Number(DEFAULT_PORT),
      };
      if (form.authUrl.trim()) payload.authUrl = form.authUrl.trim();
      if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
      if (form.databaseUrl.trim()) payload.databaseUrl = form.databaseUrl.trim();
      if (form.authSecret.trim()) payload.authSecret = form.authSecret.trim();

      updateMutation.mutate({ id: editing.id, data: payload });
      return;
    }

    createMutation.mutate({
      vendorId: Number(form.vendorId),
      projectName: form.projectName.trim() || undefined,
    });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Neon Projects</h2>
          <p className="text-sm text-gray-500">
            Manage Neon credentials for each vendor
          </p>
        </div>
        <Button
          onClick={openAddForm}
          className="bg-red-600 hover:bg-red-700 text-white"
          data-testid="button-add-neon-project"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Project
        </Button>
      </div>

      {/* ── Admin config (from .env) ── */}
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
                Default credentials used by the admin panel
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
                Auth URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                API Key
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Database URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Auth Secret
              </TableHead>
              <TableHead className="font-semibold text-gray-700">Port</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-gray-900">Admin</TableCell>
              <TableCell className="text-sm text-gray-700 max-w-[220px] truncate">
                {adminConfig?.authUrl ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-700">
                {adminConfig?.apiKey ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-700">
                {adminConfig?.databaseUrl ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-700">
                {adminConfig?.authSecret ?? "—"}
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
          data-testid="input-search-neon-projects"
        />
      </div>

      {/* ── Projects table ── */}
      <div className="relative min-h-[300px] flex-1 overflow-auto rounded-xl border border-gray-200 bg-white [&_th]:border-r [&_th]:border-gray-200 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-100 [&_td:last-child]:border-r-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-100">
        <Table className="min-w-[820px]">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
              <TableHead className="font-semibold text-gray-700">
                Vendor Name
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Auth URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                API Key
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Database URL
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                Auth Secret
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
            ) : !filteredProjects || filteredProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <KeyRound className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      {search
                        ? "No projects match your search"
                        : "No vendor projects yet"}
                    </p>
                    {!search && (
                      <p className="text-xs text-gray-400">
                        Click "Add Project" to store Neon credentials for a
                        vendor
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredProjects.map((project) => (
                <TableRow
                  key={project.id}
                  data-testid={`row-neon-project-${project.id}`}
                >
                  <TableCell className="font-medium text-gray-900">
                    {vendorName.get(project.vendorId) ?? "Unknown vendor"}
                  </TableCell>
                  <TableCell className="text-sm text-gray-700 max-w-[220px] truncate">
                    {project.authUrl}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {project.apiKey}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {project.databaseUrl}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {project.authSecret}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">
                    {project.port}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-gray-900"
                          data-testid={`button-neon-project-actions-${project.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => openEditForm(project)}
                          className="cursor-pointer gap-2"
                          data-testid={`menu-edit-neon-project-${project.id}`}
                        >
                          <Pencil className="h-4 w-4 text-gray-500" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(project)}
                          className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
                          data-testid={`menu-delete-neon-project-${project.id}`}
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
              {editing ? "Edit Neon Project" : "Add Neon Project"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Leave a field blank to keep its current value."
                : "Allocate a new Neon database for the selected vendor."}
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
                <SelectTrigger data-testid="select-project-vendor">
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

            {!editing && (
              <>
                <div className="space-y-2">
                  <Label>Gym / Database Name</Label>
                  <Input
                    placeholder="e.g. FitLife-Gym (defaults to business name)"
                    value={form.projectName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, projectName: e.target.value }))
                    }
                    data-testid="input-project-name"
                  />
                  <p className="text-xs text-gray-400">
                    A new Neon project with this name will be created, migrated and
                    connected to the vendor automatically.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input value={DEFAULT_PORT} disabled className="bg-muted" />
                  <p className="text-xs text-gray-400">
                    Default port 5000 is used for all vendors.
                  </p>
                </div>
              </>
            )}

            {editing && (
              <>
                <div className="space-y-2">
                  <Label>Neon Auth URL</Label>
                  <Input
                placeholder={
                  editing ? editing.authUrl : "https://ep-xxxx.neonauth.us-east-1.aws.neon.tech"
                }
                value={form.authUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, authUrl: e.target.value }))
                }
                data-testid="input-auth-url"
              />
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                placeholder={editing ? editing.apiKey : "napi_..."}
                value={form.apiKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, apiKey: e.target.value }))
                }
                data-testid="input-api-key"
              />
            </div>

            <div className="space-y-2">
              <Label>Database URL</Label>
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
              <Label>Auth Secret</Label>
              <Input
                placeholder={
                  editing ? editing.authSecret : "your-auth-secret..."
                }
                value={form.authSecret}
                onChange={(e) =>
                  setForm((f) => ({ ...f, authSecret: e.target.value }))
                }
                data-testid="input-auth-secret"
              />
            </div>

            <div className="space-y-2">
              <Label>Port</Label>
              <Input value={DEFAULT_PORT} disabled className="bg-muted" />
              <p className="text-xs text-gray-400">
Default port 5000 is used for all vendors.
                  </p>
                </div>
              </>
            )}

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
                data-testid="button-save-neon-project"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Add Project"}
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
            <DialogTitle>Delete Neon project?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `This will remove the stored credentials for ${
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
              data-testid="button-confirm-delete-neon-project"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
