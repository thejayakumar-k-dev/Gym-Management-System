import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { onAuthStateChange, signOut, type AuthUser } from "@/lib/auth";
import { authReady } from "@/lib/firebase";
import { isAdminUser } from "@/lib/admin";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import type { Vendor } from "@shared/schema";
import Dashboard from "@/pages/dashboard";
import Students from "@/pages/students";
import Payments from "@/pages/payments";
import MembershipPlans from "@/pages/membership-plans";
import ModifyPayments from "@/pages/modify-payments";
import IncomeDashboard from "@/pages/income-dashboard";
import PaymentHistory from "@/pages/payment-history";
import AttendanceHistory from "@/pages/attendance-history";
import AttendancePad from "@/pages/attendance-pad-normal";
import GymSettings from "@/pages/gym-settings";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import AdminPanel from "@/pages/admin";
import { GymNameContext } from "@/lib/gym-name";
import { ReadOnlyContext, setReadOnlyMode } from "@/lib/read-only";

const AUTH_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const LOGIN_PATH = "/login";

function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

function Router({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/students" component={() => <Students isAdmin={isAdmin} />} />
      <Route path="/payments" component={Payments} />
      <Route path="/membership-plans" component={() => <MembershipPlans isAdmin={isAdmin} />} />
      <Route path="/modify-payments" component={() => <ModifyPayments isAdmin={isAdmin} />} />
      <Route path="/income-dashboard" component={IncomeDashboard} />
      <Route path="/payment-history" component={PaymentHistory} />
      <Route path="/attendance-history" component={AttendanceHistory} />
      <Route path="/attendance-pad" component={AttendancePad} />
      <Route path="/settings" component={GymSettings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const [location, setLocation] = useLocation();
  // Admin viewing a vendor panel can flip between Edit and Read Only via the
  // header toggle. A vendor logging into their own gym is never affected.
  const [readOnly, setReadOnly] = useState(false);
  const isAdmin = isAdminUser(user);

  // Check if admin is currently viewing as a vendor (from URL /vendors/:id or sessionStorage)
  const [impersonatedVendorId, setImpersonatedVendorId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/vendors\/(\d+)/);
    if (match) {
      sessionStorage.setItem("admin_active_vendor_id", match[1]);
      return match[1];
    }
    return sessionStorage.getItem("admin_active_vendor_id");
  });

  useEffect(() => {
    const match = location.match(/^\/vendors\/(\d+)/);
    if (match) {
      sessionStorage.setItem("admin_active_vendor_id", match[1]);
      // Drop any cached admin-panel / other-vendor data so the vendor panel
      // never renders another tenant's rows (staleTime is Infinity).
      queryClient.clear();
      setImpersonatedVendorId(match[1]);
      setLocation("/", { replace: true });
    }
  }, [location, setLocation]);

  const inVendorPanel = isAdmin && !!impersonatedVendorId;
  const adminRoute = isAdminPath(location);
  const redirectFromAdminRoute = (!isAdmin && adminRoute) || (inVendorPanel && adminRoute);

  useEffect(() => {
    if (redirectFromAdminRoute) {
      setLocation("/", { replace: true });
    }
  }, [redirectFromAdminRoute, setLocation]);

  // Keep the module-level flag (checked by apiRequest) in sync so every write
  // is blocked while Read Only is on, and cleared when we leave the panel.
  useEffect(() => {
    setReadOnlyMode(inVendorPanel && readOnly);
    return () => setReadOnlyMode(false);
  }, [inVendorPanel, readOnly]);

  const { data: activeVendor } = useQuery<Vendor>({
    queryKey: ["/api/vendors", impersonatedVendorId],
    enabled: !!impersonatedVendorId && isAdmin,
  });

  // Vendor users sign in with their phone number as `{phone}@gmail.com`.
  // Resolve their record (which holds the admin-set business name) so the
  // vendor panel shows the right gym name.
  const vendorPhone = user.email?.match(/^(\d{10})@gmail\.com$/)?.[1] ?? undefined;
  const { data: vendorStatus } = useQuery<{
    vendorName: string;
    businessName: string | null;
  }>({
    queryKey: ["/api/vendor-accounts/status", vendorPhone],
    enabled: !!vendorPhone && !isAdmin,
  });

  // Theme scoping. The admin's own preference applies everywhere the admin is
  // acting — both the admin panel and any vendor they impersonate — so
  // "Open as Vendor" always matches what the admin is looking at. Real vendors
  // each get their own key (the phone number they sign in with), so two
  // vendors sharing a machine never inherit each other's preference.
  const themeStorageKey = isAdmin
    ? "theme:admin"
    : `theme:vendor:${vendorPhone ?? user.id}`;

  if (redirectFromAdminRoute) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 text-sm text-gray-500">
        Redirecting...
      </div>
    );
  }

  const handleExitVendorMode = () => {
    sessionStorage.removeItem("admin_active_vendor_id");
    // Fresh cache for the admin panel — and for the next vendor we open.
    queryClient.clear();
    setReadOnly(false);
    setImpersonatedVendorId(null);
    setLocation("/admin/vendors");
  };

  // Admin users default to the dedicated admin panel when not impersonating a vendor.
  if (isAdmin && !impersonatedVendorId) {
    return (
      <ThemeProvider key={themeStorageKey} defaultTheme="light" storageKey={themeStorageKey}>
        <AdminPanel />
        <Toaster />
      </ThemeProvider>
    );
  }

  const vendorDisplayName =
    activeVendor?.businessName ||
    (activeVendor ? `${activeVendor.firstName} ${activeVendor.lastName}`.trim() : undefined) ||
    vendorStatus?.businessName ||
    vendorStatus?.vendorName ||
    (impersonatedVendorId ? `Vendor #${impersonatedVendorId}` : undefined);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ThemeProvider key={themeStorageKey} defaultTheme="light" storageKey={themeStorageKey}>
      <GymNameContext.Provider value={vendorDisplayName ?? "GymDesk"}>
        <ReadOnlyContext.Provider value={inVendorPanel && readOnly}>
<TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-dvh w-full">
              <AppSidebar
                onLogout={isAdmin && impersonatedVendorId ? handleExitVendorMode : onLogout}
                vendorName={vendorDisplayName}
                isImpersonating={!!(isAdmin && impersonatedVendorId)}
              />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center justify-between h-14 px-4 sm:px-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    {isAdmin && impersonatedVendorId && (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-4 w-px bg-gray-200 hidden sm:block" />
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-800 border-amber-300 gap-1.5 py-0.5 px-2.5 font-medium text-xs rounded-full shrink-0"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                          <span>Admin View</span>
                        </Badge>
                        <span className="text-sm font-semibold text-gray-700 dark:text-white truncate hidden md:inline">
                          {vendorDisplayName}
                        </span>
                      </div>
                    )}
                  </div>

                  {isAdmin && impersonatedVendorId && (
                    <div className="flex items-center gap-2">
                      <div
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted p-1"
                        role="group"
                        aria-label="Vendor panel access mode"
                      >
                        <button
                          type="button"
                          aria-pressed={!readOnly}
                          onClick={() => setReadOnly(false)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            !readOnly
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          data-testid="button-mode-edit"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-pressed={readOnly}
                          onClick={() => setReadOnly(true)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            readOnly
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          data-testid="button-mode-readonly"
                        >
                          Read Only
                        </button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExitVendorMode}
                        className="h-8 text-xs border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-medium gap-1.5 shrink-0"
                        data-testid="button-exit-vendor-mode"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Return to Admin</span>
                      </Button>
                    </div>
                  )}
                </header>
                <main className="flex-1 overflow-auto p-4 sm:p-6 bg-background">
                  <div className="max-w-7xl mx-auto">
                    <Router isAdmin={isAdmin} />
                  </div>
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
        </ReadOnlyContext.Provider>
      </GymNameContext.Provider>
    </ThemeProvider>
  );
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [location, setLocation] = useLocation();
  // Start as true — Firebase resolves auth state asynchronously on mount
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled) return;
      unsubscribe = onAuthStateChange((firebaseUser) => {
        if (!firebaseUser) {
          sessionStorage.removeItem("admin_active_vendor_id");
        }
        setUser(firebaseUser);
        setAuthLoading(false);
      });
    };

    void authReady.catch(() => undefined).then(subscribe);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      if (location !== LOGIN_PATH) {
        setLocation(LOGIN_PATH, { replace: true });
      }
      return;
    }

    if (location === LOGIN_PATH) {
      const admin = isAdminUser(user);
      const activeVendorId = sessionStorage.getItem("admin_active_vendor_id");
      setLocation(admin && !activeVendorId ? "/admin" : "/", { replace: true });
    }
  }, [authLoading, location, setLocation, user]);

  useEffect(() => {
    if (!user) return;

    const timeout = window.setTimeout(() => {
      void signOut();
    }, AUTH_SESSION_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [user]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user && location === LOGIN_PATH) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Redirecting...
      </div>
    );
  }

  if (!user) {
    return (
      <ThemeProvider defaultTheme="light" storageKey="theme:login">
        <LoginPage onLogin={() => {
          // onAuthStateChange will automatically fire and set user — no manual call needed
        }} />
      </ThemeProvider>
    );
  }

  const handleLogout = async () => {
    await signOut();
    // onAuthStateChange will automatically set user to null
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthenticatedApp user={user} onLogout={handleLogout} />
    </QueryClientProvider>
  );
}

export default App;
