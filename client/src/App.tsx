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
import { ShieldCheck } from "lucide-react";
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
    (impersonatedVendorId ? `Vendor #${impersonatedVendorId}` : undefined);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <div className="flex flex-col h-dvh w-full">
          {isAdmin && impersonatedVendorId && (
            <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-xs sm:text-sm font-medium z-50 shrink-0 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-200 shrink-0" />
                <span>
                  Admin Mode: Viewing vendor panel for <strong>{vendorDisplayName}</strong>
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs bg-white text-gray-900 hover:bg-gray-100 font-semibold"
                onClick={handleExitVendorMode}
                data-testid="button-exit-vendor-mode"
              >
                Return to Admin Panel
              </Button>
            </div>
          )}

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-full w-full">
                <AppSidebar
                  onLogout={isAdmin && impersonatedVendorId ? handleExitVendorMode : onLogout}
                  vendorName={vendorDisplayName}
                  isImpersonating={!!(isAdmin && impersonatedVendorId)}
                />
                <div className="flex flex-col flex-1 overflow-hidden">
                  <header className="flex items-center h-14 px-4 sm:px-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                  </header>
                  <main className="flex-1 overflow-auto p-4 sm:p-6 bg-background">
                    <div className="max-w-7xl mx-auto">
                      <Router />
                    </div>
                  </main>
                </div>
              </div>
            </SidebarProvider>
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
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
