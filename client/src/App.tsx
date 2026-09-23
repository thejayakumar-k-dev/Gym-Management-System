import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { onAuthStateChange, signOut, type AuthUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
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

function App() {
  const [location] = useLocation();
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

  // Admin users get the dedicated admin panel — enforced by email check.
  if (isAdminUser(user)) {
    return (
      <QueryClientProvider client={queryClient}>
        <AdminPanel />
        <Toaster />
      </QueryClientProvider>
    );
  }

  // Non-admins trying to open /admin are blocked.
  if (location === "/admin") {
    return <NotFound />;
  }

  const handleLogout = async () => {
    await signOut();
    // onAuthStateChange will automatically set user to null
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-dvh w-full">
              <AppSidebar onLogout={handleLogout} />
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
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
