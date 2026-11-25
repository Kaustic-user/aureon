// Shared calendar pieces: one look for the month picker, range picker and date fields.
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { currentMonth, isoDate, monthLabel, parseISO, shiftMonth, todayISO } from "../lib/format";
import { cn } from "../lib/utils";
import { usePopover } from "./Dropdown";
import { Button } from "./ui";

export { usePopover };

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** 6 weeks of ISO dates covering `month`, Monday first. */
export function gridDays(month: string): string[] {
  const first = parseISO(month + "-01");
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => isoDate(new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)));
}

export const POPOVER = "z-30 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-lg border border-line bg-card p-3 shadow-2xl shadow-black/40";

/** Year stepper plus a 12-month grid. Months after `max` ("YYYY-MM") are disabled. */
export function MonthGrid({ value, onPick, max }: { value: string; onPick: (month: string) => void; max?: string }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const maxYear = max ? Number(max.slice(0, 4)) : Infinity;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear(year - 1)} aria-label="Previous year">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">{year}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear(year + 1)} disabled={year >= maxYear} aria-label="Next year">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => {
          const m = `${year}-${String(i + 1).padStart(2, "0")}`;
          const selected = m === value;
          return (
            <button
              key={m}
              type="button"
              disabled={!!max && m > max}
              onClick={() => onPick(m)}
              className={cn(
                "h-9 rounded-md text-sm transition active:scale-95 disabled:pointer-events-none disabled:opacity-30",
                selected ? "bg-accent font-semibold text-[var(--color-on-accent)]" : "text-zinc-200 hover:bg-hover",
              )}
            >
              {monthLabel(m, "short")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Calendar header: « year back, ‹ month back, a title you can click to jump
 * straight to any month and year, › and ». `children` is the day grid.
 */
export function CalendarFrame({ view, onView, children }: { view: string; onView: (m: string) => void; children: ReactNode }) {
  const [picking, setPicking] = useState(false);
  const nav = (icon: ReactNode, label: string, by: number) => (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(shiftMonth(view, by))} aria-label={label}>
      {icon}
    </Button>
  );
  const title = (
    <button
      type="button"
      onClick={() => setPicking((p) => !p)}
      aria-expanded={picking}
      className="rounded-md px-2 py-1 text-sm font-medium transition hover:bg-hover"
      title={picking ? "Back to days" : "Pick month and year"}
    >
      {picking ? "Back to days" : monthLabel(view)}
    </button>
  );
  if (picking) {
    return (
      <div>
        <div className="mb-2 flex justify-center">{title}</div>
        <MonthGrid
          value={view}
          onPick={(m) => {
            onView(m);
            setPicking(false);
          }}
        />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex">
          {nav(<ChevronsLeft className="h-4 w-4" />, "Previous year", -12)}
          {nav(<ChevronLeft className="h-4 w-4" />, "Previous month", -1)}
        </span>
        {title}
        <span className="flex">
          {nav(<ChevronRight className="h-4 w-4" />, "Next month", 1)}
          {nav(<ChevronsRight className="h-4 w-4" />, "Next year", 12)}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Monday-first day grid. `state` says how to paint each day. */
export function DayGrid({
  view,
  onPick,
  onHover,
  state,
}: {
  view: string;
  onPick: (d: string) => void;
  onHover?: (d: string | null) => void;
  state: (d: string) => { edge: boolean; inRange: boolean };
}) {
  const today = todayISO();
  return (
    <>
      <div className="grid grid-cols-7 text-center text-[11px] text-faint">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover?.(null)}>
        {gridDays(view).map((d) => {
          const inMonth = d.slice(0, 7) === view;
          const { edge, inRange } = state(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover?.(d)}
              aria-label={d}
              aria-pressed={edge}
              className={cn(
                "h-9 text-sm tabular-nums transition",
                inMonth ? "text-zinc-200" : "text-zinc-600",
                inRange && !edge && "bg-accent/15",
                edge && "rounded-md bg-accent font-semibold text-[var(--color-on-accent)]",
                !inRange && "rounded-md hover:bg-hover",
                d === today && !edge && "font-semibold text-accent",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** A single date, replacing the browser's <input type="date">. Value is "YYYY-MM-DD". */
export function DateField({
  value,
  onChange,
  align = "left",
  className,
}: {
  value: string;
  onChange: (d: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const { open, setOpen, box } = usePopover();
  const [view, setView] = useState((value || todayISO()).slice(0, 7));
  const label = value ? parseISO(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Pick a date";
  const choose = (d: string) => {
    onChange(d);
    setOpen(false);
  };
  return (
    <div ref={box} className={cn("relative", className)}>
      <Button
        onClick={() => {
          setView((value || todayISO()).slice(0, 7));
          setOpen(!open);
        }}
        aria-expanded={open}
        className="w-full justify-start bg-bg font-normal"
      >
        <CalendarDays className="h-4 w-4 text-muted" />
        <span className="truncate tabular-nums">{label}</span>
      </Button>
      {open && (
        <div className={cn("absolute", POPOVER, align === "right" ? "right-0" : "left-0")} onClick={(e) => e.preventDefault()} /* inside a <label>: stop it re-clicking the button */>
          <CalendarFrame view={view} onView={setView}>
            <DayGrid view={view} onPick={choose} state={(d) => ({ edge: d === value, inRange: d === value })} />
            <div className="mt-2 flex justify-between border-t border-line pt-2">
              <Button size="sm" variant="ghost" onClick={() => choose(todayISO())}>Today</Button>
            </div>
          </CalendarFrame>
        </div>
      )}
    </div>
  );
}

/** ‹ month › stepper whose label opens a month/year grid. Used by Overview and Budgets. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month >= currentMonth();
  const { open, setOpen, box } = usePopover();
  return (
    <div ref={box} className="relative">
      <div className="flex items-center rounded-md border border-line">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="flex h-9 min-w-32 items-center justify-center gap-2 border-x border-line px-3 text-sm hover:bg-hover"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title="Pick month and year"
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted" />
          {month === currentMonth() ? "This month" : monthLabel(month)}
        </button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => onChange(shiftMonth(month, 1))} disabled={isCurrent} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className={`absolute right-0 ${POPOVER}`}>
          <MonthGrid
            value={month}
            max={currentMonth()}
            onPick={(m) => {
              onChange(m);
              setOpen(false);
            }}
          />
          <div className="mt-2 border-t border-line pt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(currentMonth());
                setOpen(false);
              }}
            >
              This month
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
