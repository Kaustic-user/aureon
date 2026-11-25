import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { currentMonth, monthLabel, parseISO, shiftMonth, todayISO } from "../lib/format";
import { ALL_START, addDays, monthBounds, PRESETS, rangeLabel, type DateRange } from "../lib/useRange";
import { cn } from "../lib/utils";
import { CalendarFrame, DayGrid, MonthGrid, POPOVER, usePopover } from "./Calendar";
import { Button } from "./ui";

/** A period is either a calendar month or a custom day range. */
export type Period = { month: string } | { range: DateRange };

const sameRange = (a: DateRange, b: DateRange) => a.start === b.start && a.end === b.end;

/** If a range is exactly one calendar month, return that month. */
function asMonth(r: DateRange): string | null {
  const m = r.start.slice(0, 7);
  return sameRange(r, monthBounds(m)) ? m : null;
}

function dayCount(r: DateRange) {
  return Math.round((parseISO(r.end).getTime() - parseISO(r.start).getTime()) / 86_400_000) + 1;
}

/**
 * One control for "which period": ‹ label › plus a popover with quick presets,
 * a month grid and a custom day range. Picking exactly one calendar month
 * (by any route) is treated as month mode, so the URL stays tidy.
 */
export function PeriodPicker({ month, range, onChange }: { month: string; range: DateRange | null; onChange: (p: Period) => void }) {
  const { open, setOpen, box } = usePopover();
  const [tab, setTab] = useState<"months" | "custom">("months");
  const [view, setView] = useState(month);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const today = todayISO();
  const period: DateRange = range ?? monthBounds(month);
  const isAll = !!range && range.start === ALL_START;

  const apply = (r: DateRange) => {
    const m = asMonth(r);
    onChange(m ? { month: m } : { range: r });
    setOpen(false);
    setAnchor(null);
  };

  const preset = range ? PRESETS.find((p) => sameRange(p.range(), range)) : undefined;
  const label = !range ? (month === currentMonth() ? "This month" : monthLabel(month)) : preset ? preset.label : rangeLabel(range);

  // Arrows move by the period's own length: a month, or N days for a custom range.
  const step = (dir: 1 | -1) => {
    if (!range) return onChange({ month: shiftMonth(month, dir) });
    const n = dayCount(range);
    const next = dir === 1 ? { start: addDays(range.end, 1), end: addDays(range.end, n) } : { start: addDays(range.start, -n), end: addDays(range.start, -1) };
    if (next.end > today) next.end = today;
    apply(next);
  };
  const canNext = isAll ? false : range ? range.end < today : month < currentMonth();

  const toggle = () => {
    setOpen(!open);
    setAnchor(null);
    setHover(null);
    setTab(range && !preset ? "custom" : "months");
    setView((isAll ? period.end : period.start).slice(0, 7));
  };

  const shown: DateRange = anchor ? { start: hover && hover < anchor ? hover : anchor, end: hover && hover > anchor ? hover : anchor } : period;

  return (
    <div ref={box} className="relative">
      <div className="flex items-center rounded-md border border-line">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => step(-1)} disabled={isAll} aria-label="Previous period">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="flex h-9 min-w-36 items-center justify-center gap-2 border-x border-line px-3 text-sm hover:bg-hover"
          onClick={toggle}
          aria-expanded={open}
          title="Change period"
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted" />
          <span className="truncate">{label}</span>
        </button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => step(1)} disabled={!canNext} aria-label="Next period">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className={`absolute right-0 ${POPOVER}`}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const on = !!range ? preset?.label === p.label : p.label === "This month" && month === currentMonth();
              return (
                <button
                  key={p.label}
                  onClick={() => apply(p.range())}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition active:scale-95",
                    on ? "border-accent/40 bg-accent/10 text-accent" : "border-line text-muted hover:bg-hover hover:text-zinc-100",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="mb-3 grid grid-cols-2 rounded-md border border-line bg-bg p-0.5 text-xs">
            {(["months", "custom"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setAnchor(null);
                }}
                className={cn("rounded py-1 transition", tab === t ? "bg-hover font-medium text-zinc-100" : "text-muted hover:text-zinc-100")}
              >
                {t === "months" ? "Month" : "Custom range"}
              </button>
            ))}
          </div>

          {tab === "months" ? (
            <MonthGrid value={range ? (asMonth(range) ?? view) : month} max={currentMonth()} onPick={(m) => {
                onChange({ month: m });
                setOpen(false);
              }} />
          ) : (
            <CalendarFrame view={view} onView={setView}>
              <DayGrid
                view={view}
                onPick={(d) => (anchor ? apply(d < anchor ? { start: d, end: anchor } : { start: anchor, end: d }) : setAnchor(d))}
                onHover={setHover}
                state={(d) => ({ edge: d === shown.start || d === shown.end, inRange: d >= shown.start && d <= shown.end })}
              />
              <p className="mt-2 text-xs text-faint">{anchor ? "Now click the last day of the range." : "Click a first day, then a last day."}</p>
            </CalendarFrame>
          )}
        </div>
      )}
    </div>
  );
}
