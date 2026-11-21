import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isoDate, monthLabel, parseISO, shiftMonth, todayISO } from "../lib/format";
import { ALL_START, PRESETS, rangeLabel, type DateRange } from "../lib/useRange";
import { cn } from "../lib/utils";
import { Button } from "./ui";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** 6 weeks of ISO dates covering `month`, Monday first. */
function gridDays(month: string): string[] {
  const first = parseISO(month + "-01");
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => isoDate(new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)));
}

/**
 * Button that opens a calendar. Click a day to start, click another to finish;
 * the range is applied (and the popover closes) on the second click.
 */
export function RangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(value.end.slice(0, 7));
  const [anchor, setAnchor] = useState<string | null>(null); // first click, waiting for the second
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const today = todayISO();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => !o);
    setAnchor(null);
    setHover(null);
    setView((value.start === ALL_START ? value.end : value.start).slice(0, 7));
  };

  const apply = (r: DateRange) => {
    onChange(r);
    setOpen(false);
    setAnchor(null);
  };

  const pick = (d: string) => {
    if (!anchor) return setAnchor(d);
    apply(d < anchor ? { start: d, end: anchor } : { start: anchor, end: d });
  };

  // What to paint: the pending selection while choosing, otherwise the applied range.
  const shown: DateRange = anchor
    ? { start: hover && hover < anchor ? hover : anchor, end: hover && hover > anchor ? hover : anchor }
    : value;

  return (
    <div ref={box} className="relative">
      <Button onClick={toggle} aria-expanded={open} className="min-w-44 justify-start">
        <CalendarDays className="h-4 w-4 text-muted" />
        <span className="truncate">{rangeLabel(value)}</span>
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-lg border border-line bg-card p-3 shadow-2xl shadow-black/60">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => apply(p.range())}
                className="rounded-md border border-line px-2 py-1 text-xs text-muted transition hover:bg-hover hover:text-zinc-100 active:scale-95"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView(shiftMonth(view, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{monthLabel(view)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView(shiftMonth(view, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] text-faint">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
            {gridDays(view).map((d) => {
              const inMonth = d.slice(0, 7) === view;
              const isEdge = d === shown.start || d === shown.end;
              const inRange = d >= shown.start && d <= shown.end;
              return (
                <button
                  key={d}
                  onClick={() => pick(d)}
                  onMouseEnter={() => setHover(d)}
                  aria-label={d}
                  aria-pressed={isEdge}
                  className={cn(
                    "h-9 text-sm font-mono tabular-nums transition",
                    inMonth ? "text-zinc-200" : "text-zinc-600",
                    inRange && !isEdge && "bg-zinc-800",
                    isEdge && "rounded-md bg-zinc-50 font-semibold text-zinc-950",
                    !inRange && "rounded-md hover:bg-hover",
                    d === today && !isEdge && "text-accent",
                  )}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-faint">
            {anchor ? "Now click the last day of the range." : "Click a first day, then a last day."}
          </p>
        </div>
      )}
    </div>
  );
}
