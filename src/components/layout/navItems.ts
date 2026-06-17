import { Briefcase, FileText, LayoutDashboard, Settings, TrendingUp } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/roles", label: "Roles", icon: Briefcase },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/insights", label: "Insights", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
