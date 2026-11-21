import { useSearchParams } from "react-router";
import { currentMonth, isoDate, parseISO, todayISO } from "./format";

/** "All time" is stored as an ordinary range that starts here, so the URL stays `?start=…&end=…`. */
export const ALL_START = "2000-01-01";

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface DateRange {
  start: string;
  end: string;
}

/** First and last day of a YYYY-MM month, as ISO dates. */
export function monthBounds(month: string): DateRange {
  const [y, m] = month.split("-").map(Number);
  return { start: isoDate(new Date(y, m - 1, 1)), end: isoDate(new Date(y, m, 0)) };
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export interface Preset {
  label: string;
  range: () => DateRange;
}

/** Quick ranges, all relative to today. "FY" is the Indian financial year (1 Apr – 31 Mar). */
export const PRESETS: Preset[] = [
  { label: "Last 7 days", range: () => ({ start: addDays(todayISO(), -6), end: todayISO() }) },
  { label: "Last 30 days", range: () => ({ start: addDays(todayISO(), -29), end: todayISO() }) },
  { label: "This month", range: () => monthBounds(currentMonth()) },
  {
    label: "Last month",
    range: () => {
      const [y, m] = currentMonth().split("-").map(Number);
      return monthBounds(isoDate(new Date(y, m - 2, 1)).slice(0, 7));
    },
  },
  {
    label: "Last 3 months",
    range: () => {
      const [y, m] = currentMonth().split("-").map(Number);
      return { start: isoDate(new Date(y, m - 3, 1)), end: todayISO() };
    },
  },
  {
    label: "This FY",
    range: () => {
      const t = parseISO(todayISO());
      const fy = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
      return { start: `${fy}-04-01`, end: todayISO() };
    },
  },
  { label: "This year", range: () => ({ start: `${todayISO().slice(0, 4)}-01-01`, end: todayISO() }) },
  { label: "All time", range: () => ({ start: ALL_START, end: todayISO() }) },
];

/**
 * Custom date range kept in the URL (?start=YYYY-MM-DD&end=YYYY-MM-DD).
 * `range` is null in plain month mode. A reversed or malformed pair is ignored.
 */
export function useRangeParam(): [DateRange | null, (r: DateRange | null) => void] {
  const [params, setParams] = useSearchParams();
  const s = params.get("start");
  const e = params.get("end");
  const range = s && e && ISO.test(s) && ISO.test(e) && s <= e ? { start: s, end: e } : null;
  const set = (r: DateRange | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("month");
        if (r) {
          n.set("start", r.start);
          n.set("end", r.end);
        } else {
          n.delete("start");
          n.delete("end");
        }
        return n;
      },
      { replace: true },
    );
  return [range, set];
}

export function rangeLabel({ start, end }: DateRange): string {
  if (start === ALL_START) return "All time";
  const fmt = (s: string, year: boolean) =>
    parseISO(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: year ? "numeric" : undefined });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (start === end) return fmt(start, true);
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}
