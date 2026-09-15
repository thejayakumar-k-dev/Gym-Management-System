import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isAdminUser } from "@/lib/admin";
import { LayoutDashboard, LogOut, Menu, X, Dumbbell, ShieldAlert, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import Vendors from "@/pages/vendors";

const sidebarItems = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/admin" },
  { title: "Vendors", icon: Store, url: "/admin/vendors" },
];

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/vendors": "Vendors",
};

export default function AdminPanel() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [location, setLocation] = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUserId(data.user?.id ?? null);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">Checking access...</div>
      </div>
    );
  }

  // Only the admin UID may view this panel.
  if (!isAdminUser({ id: userId })) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50 gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <ShieldAlert className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Access Denied</h1>
        <p className="text-sm text-gray-500 max-w-sm">
          You don&apos;t have permission to view the admin panel. Contact the
          administrator if you believe this is a mistake.
        </p>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="mt-2"
        >
          Log out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* ── Sidebar ── */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-16"
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-300 shrink-0`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <Dumbbell className="h-6 w-6 text-red-500" />
              <span className="text-sm font-bold text-gray-900">
                Admin <span className="text-red-500">Panel</span>
              </span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.title}
              onClick={() => setLocation(item.url)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                location === item.url
                  ? "bg-red-50 text-red-600"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {sidebarOpen && <span>{item.title}</span>}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-gray-100 text-gray-500 text-sm font-medium transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
          <h1 className="text-lg font-semibold text-gray-900">
            {pageTitles[location] ?? "Dashboard"}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-auto p-6">
          <div className="mx-auto h-full max-w-6xl">
            {location === "/admin/vendors" ? (
              <Vendors />
            ) : (
              <p className="text-gray-500 text-sm">
                Welcome to the Admin Panel. More sections coming soon.
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
