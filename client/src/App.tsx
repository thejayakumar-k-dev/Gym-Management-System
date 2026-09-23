import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { onAuthStateChange, signOut, type AuthUser } from "@/lib/auth";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/students" component={Students} />
      <Route path="/payments" component={Payments} />
      <Route path="/modify-payments" component={ModifyPayments} />
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
      setImpersonatedVendorId(match[1]);
      setLocation("/");
    }
  }, [location, setLocation]);

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

  const handleExitVendorMode = () => {
    sessionStorage.removeItem("admin_active_vendor_id");
    setImpersonatedVendorId(null);
    setLocation("/admin/vendors");
  };

  // Admin users default to the dedicated admin panel when not impersonating a vendor.
  if (isAdmin && !impersonatedVendorId) {
    return (
      <>
        <AdminPanel />
        <Toaster />
      </>
    );
  }

  // Non-admins trying to open /admin are blocked.
  if (!isAdmin && location === "/admin") {
    return <NotFound />;
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
    <ThemeProvider defaultTheme="light">
      <GymNameContext.Provider value={vendorDisplayName ?? "GymDesk"}>
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
                        <span className="text-sm font-semibold text-gray-700 truncate hidden md:inline">
                          {vendorDisplayName}
                        </span>
                      </div>
                    )}
                  </div>

                  {isAdmin && impersonatedVendorId && (
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
                  )}
                </header>
                <main className="flex-1 overflow-auto p-4 sm:p-6 bg-background">
                  <div className="max-w-7xl mx-auto">
                    <Router />
                  </div>
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </GymNameContext.Provider>
    </ThemeProvider>
  );
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Start as true — Firebase resolves auth state asynchronously on mount
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange returns the Firebase unsubscribe function
    const unsubscribe = onAuthStateChange((firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <ThemeProvider defaultTheme="light">
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
