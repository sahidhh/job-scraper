import { LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./MobileNav";
import { NAV_ITEMS } from "./navItems";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
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
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b p-4 md:hidden">
          <span className="font-semibold">Job Intelligence</span>
          <MobileNav />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
