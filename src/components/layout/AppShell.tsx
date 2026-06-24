import Link from "next/link";
import { FileText, LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { BottomNav } from "./BottomNav";
import { NAV_ITEMS } from "./navItems";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-col border-r p-4 md:flex">
        <span className="mb-4 px-2 text-lg font-semibold">Job Intelligence</span>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Button key={href} variant="ghost" asChild className="justify-start gap-2">
              <Link href={href}>
                <Icon className="size-4" />
                {label}
              </Link>
            </Button>
          ))}
        </nav>
        <form action={logoutAction} className="mt-auto">
          <Button type="submit" variant="ghost" className="w-full justify-start gap-2">
            <LogOut className="size-4" />
            Logout
          </Button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <span className="font-semibold tracking-tight">Job Intelligence</span>
          <Button variant="ghost" size="icon" asChild className="size-9 text-muted-foreground">
            <Link href="/resume" aria-label="Resume">
              <FileText className="size-5" />
            </Link>
          </Button>
        </header>

        {/* pb-20 clears the 64px bottom nav on mobile */}
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
