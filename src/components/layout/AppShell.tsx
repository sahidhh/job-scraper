import { LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { BottomNav } from "./BottomNav";
import { SidebarNav } from "./SidebarNav";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-col border-r p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <span className="mb-5 px-1">
          <Wordmark />
        </span>
        <SidebarNav />
        {/* Chrome-level, non-navigational controls. Deliberately not in
            BottomNav (not a destination, no aria-current) and not on
            /settings (that is the settings surface AD-54 argued against). */}
        <div className="mt-auto">
          <ThemeToggle label />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut className="size-4" />
              Logout
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header. No nav shortcut here -- every destination including
            Resume is in BottomNav now, which reads the same NAV_ITEMS list. */}
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <Wordmark size="mobile" />
          <ThemeToggle />
        </header>

        {/* pb-20 clears the 64px bottom nav on mobile */}
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
