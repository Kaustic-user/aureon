import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { ALL_START, PRESETS, rangeLabel, type DateRange } from "../lib/useRange";
import { CalendarFrame, DayGrid, POPOVER, usePopover } from "./Calendar";
import { Button } from "./ui";

/**
 * Button that opens a calendar. Click a day to start, click another to finish;
 * the range is applied (and the popover closes) on the second click.
 */
export function RangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const { open, setOpen, box } = usePopover();
  const [view, setView] = useState(value.end.slice(0, 7));
  const [anchor, setAnchor] = useState<string | null>(null); // first click, waiting for the second
  const [hover, setHover] = useState<string | null>(null);

  const toggle = () => {
    setOpen(!open);
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
        <div className={`absolute right-0 ${POPOVER}`}>
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

          <CalendarFrame view={view} onView={setView}>
            <DayGrid
              view={view}
              onPick={pick}
              onHover={setHover}
              state={(d) => ({ edge: d === shown.start || d === shown.end, inRange: d >= shown.start && d <= shown.end })}
            />
            <p className="mt-2 text-xs text-faint">
              {anchor ? "Now click the last day of the range." : "Click a first day, then a last day."}
            </p>
          </CalendarFrame>
        </div>
      )}
    </div>
  );
}
