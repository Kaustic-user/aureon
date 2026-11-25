import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  HardDrive,
  LayoutGrid,
  Menu,
  Moon,
  PiggyBank,
  Plus,
  Search,
  Sun,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useActions } from "../lib/actions";
import { usePrivacy } from "../lib/privacy";
import { useTheme } from "../lib/theme";
import { cn } from "../lib/utils";
import { Button, Skeleton } from "./ui";

const NAV: { group: string; items: { to: string; label: string; icon: ReactNode }[] }[] = [
  {
    group: "Money",
    items: [
      { to: "/", label: "Overview", icon: <LayoutGrid className="h-4 w-4" /> },
      { to: "/transactions", label: "Transactions", icon: <ArrowLeftRight className="h-4 w-4" /> },
      { to: "/budgets", label: "Budgets", icon: <PiggyBank className="h-4 w-4" /> },
      { to: "/accounts", label: "Accounts", icon: <Wallet className="h-4 w-4" /> },
      { to: "/friends", label: "Friends", icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    group: "Invest",
    items: [{ to: "/investments", label: "Investments", icon: <TrendingUp className="h-4 w-4" /> }],
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-accent to-sky-500 text-sm font-bold text-[var(--color-on-accent)] shadow-sm">A</div>
      <span className="text-[15px] font-semibold tracking-tight">Aureon</span>
    </div>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{g.group}</div>
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-sm transition active:scale-[0.98]",
                    isActive ? "border-accent/30 bg-accent/10 text-accent" : "border-transparent text-muted hover:bg-hover hover:text-zinc-100",
                  )
                }
              >
                {i.icon}
                {i.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function LocalBadge() {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-faint">
        <HardDrive className="h-3 w-3" /> Local data
      </div>
      <div className="mt-1 text-xs text-zinc-300">Stored only on this device</div>
      <div className="mt-0.5 font-mono text-[11px] text-faint">127.0.0.1 · no cloud</div>
    </div>
  );
}

export function Layout() {
  const { masked, toggle } = usePrivacy();
  const { theme, toggle: toggleTheme } = useTheme();
  const { openTxn, openQuick } = useActions();
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname]);

  return (
    <div className="flex min-h-full">
      {/* Sidebar — lg and up */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-line p-3 lg:flex">
        <div className="space-y-6">
          <div className="pt-2">
            <Logo />
          </div>
          <Nav />
        </div>
        <LocalBadge />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setDrawer(false)}>
          <aside className="flex h-full w-64 flex-col justify-between border-r border-line bg-bg p-3" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-6">
              <div className="flex items-center justify-between pt-2">
                <Logo />
                <Button variant="ghost" size="icon" onClick={() => setDrawer(false)} aria-label="Close menu">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Nav onNavigate={() => setDrawer(false)} />
            </div>
            <LocalBadge />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </Button>
            <div className="lg:hidden">
              <Logo />
            </div>
            <button
              onClick={openQuick}
              className="ml-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-dashed border-line px-3 text-left text-sm text-faint transition hover:border-zinc-600 hover:bg-hover hover:text-muted sm:max-w-md lg:ml-0"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Quick add, e.g. “240 chai at Blue Tokai”</span>
              <kbd className="ml-auto hidden rounded border border-line px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
            </button>
            <div className="flex items-center gap-2 lg:ml-auto">
              <Button size="icon" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button size="icon" onClick={toggle} aria-label={masked ? "Show amounts" : "Hide amounts"} title={masked ? "Show amounts" : "Hide amounts"}>
                {masked ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="primary" onClick={() => openTxn()}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add expense</span>
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
          <Suspense fallback={<Skeleton className="h-40" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
