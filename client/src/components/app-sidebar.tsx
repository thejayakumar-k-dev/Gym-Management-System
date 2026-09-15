import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  TrendingUp,
  History,
  Calendar,
  Fingerprint,
  LogOut,
  Moon,
  Sun,
  Edit,
  Settings,
} from "lucide-react";
import { Dumbbell } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { useGymSettings } from "@/hooks/use-gym-settings";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Students",
    url: "/students",
    icon: Users,
  },
  {
    title: "Payments",
    url: "/payments",
    icon: DollarSign,
  },
  {
    title: "Income Dashboard",
    url: "/income-dashboard",
    icon: TrendingUp,
  },
  {
    title: "Payment History",
    url: "/payment-history",
    icon: History,
  },
  {
    title: "Modify Payments",
    url: "/modify-payments",
    icon: Edit,
  },
  {
    title: "Attendance History",
    url: "/attendance-history",
    icon: Calendar,
  },
  {
    title: "Attendance Pad",
    url: "/attendance-pad",
    icon: Fingerprint,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { settings } = useGymSettings();

  return (
    <Sidebar>
      <SidebarHeader className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md text-xl flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: settings.accentColor }}
          >
            {settings.logoImage ? (
              <img
                src={settings.logoImage}
                alt="Logo"
                className="w-full h-full object-cover"
                style={{ transform: `scale(${settings.cropScale})` }}
              />
            ) : (
              settings.icon
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {settings.name}
            </h1>
            <p className="text-xs text-muted-foreground">Management System</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    className={`!h-auto px-4 py-3 rounded-none border-l-4 border-transparent data-[active=true]:bg-red-50 dark:data-[active=true]:bg-red-950/30 data-[active=true]:border-l-red-500 data-[active=true]:text-red-600 dark:data-[active=true]:text-red-400`}
                    data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link
                      href={item.url}
                      className="flex items-center gap-3 w-full"
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      <span className="font-medium text-foreground">
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-auto px-4 py-3"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          data-testid="button-dark-mode"
        >
          {theme === "dark" ? (
            <>
              <Moon className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium">Dark Mode</span>
            </>
          ) : (
            <>
              <Moon className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium">Dark Mode</span>
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-auto px-4 py-3"
          data-testid="button-logout"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
