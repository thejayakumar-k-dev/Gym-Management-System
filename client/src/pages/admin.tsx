import { useEffect, useState } from "react";
import { onAuthStateChange, signOut } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Dumbbell,
  ShieldAlert,
  Store,
  Wallet,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useTheme } from "@/components/theme-provider";
import AdminDashboard from "@/pages/admin-dashboard";
import Vendors from "@/pages/vendors";
import VendorAccounts from "@/pages/vendor-accounts";

const sidebarItems = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/admin" },
  { title: "Vendors", icon: Store, url: "/admin/vendors" },
  { title: "Vendor Accounts", icon: Wallet, url: "/admin/vendor-accounts" },
];

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/vendors": "Vendors",
  "/admin/vendor-accounts": "Vendor Accounts",
};

type SidebarNavProps = {
  showLabels: boolean;
  location: string;
  onNavigate: (url: string) => void;
  onLogout: () => void;
};

function SidebarNav({
  showLabels,
  location,
  onNavigate,
  onLogout,
}: SidebarNavProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <>
      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
        {sidebarItems.map((item) => (
          <button
            key={item.title}
            onClick={() => onNavigate(item.url)}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              location === item.url
                ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">{item.title}</span>}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground text-sm font-medium transition-colors"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={isDark}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          data-testid="button-dark-mode"
        >
          {isDark ? (
            <Sun className="h-5 w-5 shrink-0" />
          ) : (
            <Moon className="h-5 w-5 shrink-0" />
          )}
          {showLabels && <span>{isDark ? "Light Mode" : "Dark Mode"}</span>}
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-accent-foreground text-sm font-medium transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {showLabels && <span>Logout</span>}
        </button>
      </div>
    </>
  );
}

export default function AdminPanel() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
      setChecking(false);
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
  };

  const navigate = (url: string) => {
    setLocation(url);
    setMobileNavOpen(false);
  };

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Checking access...</div>
      </div>
    );
  }

  // Only the admin UID may view this panel.
  if (!isAdminUser({ id: userId, email: userEmail })) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          You don&apos;t have permission to view the admin panel. Contact the
          administrator if you believe this is a mistake.
        </p>
        <Button variant="outline" onClick={handleLogout} className="mt-2">
          Log out
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`flex h-dvh bg-background ${
        sidebarOpen ? "md:[--admin-sidebar-w:16rem]" : "md:[--admin-sidebar-w:4rem]"
      }`}
    >
      {/* ── Desktop sidebar ── */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-16"
        } hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 shrink-0`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <Dumbbell className="h-6 w-6 text-destructive" />
              <span className="text-sm font-bold text-sidebar-foreground">
                Admin <span className="text-destructive">Panel</span>
              </span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        <SidebarNav
          showLabels={sidebarOpen}
          location={location}
          onNavigate={navigate}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Mobile drawer ── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-sidebar border-r border-sidebar-border shadow-xl">
            <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-6 w-6 text-destructive" />
                <span className="text-sm font-bold text-sidebar-foreground">
                  Admin <span className="text-destructive">Panel</span>
                </span>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav
              showLabels
              location={location}
              onNavigate={navigate}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-card border-b border-border flex items-center gap-3 px-4 sm:px-6 shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">
            {pageTitles[location] ?? "Dashboard"}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
          <div className="h-full w-full">
            {location === "/admin/vendors" ? (
              <Vendors />
            ) : location === "/admin/vendor-accounts" ? (
              <VendorAccounts />
            ) : (
              <AdminDashboard />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
