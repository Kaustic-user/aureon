// Money is integer paise everywhere. These helpers are the only place that
// converts it to rupees for display.

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** ₹12,34,567 — rounded to the rupee unless `exact`. */
export function money(paise: number, opts: { exact?: boolean; sign?: boolean } = {}): string {
  const rupees = paise / 100;
  const s = (opts.exact ? inr2 : inr0).format(Math.abs(rupees));
  if (opts.sign) return (paise > 0 ? "+" : paise < 0 ? "−" : "") + s;
  return paise < 0 ? "−" + s : s;
}

/** ₹12.3L, ₹4.5Cr, ₹45k — for chart axes. */
export function moneyCompact(paise: number): string {
  const r = paise / 100;
  const a = Math.abs(r);
  const sign = r < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${compactFmt.format(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${compactFmt.format(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${compactFmt.format(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}

export function pct(x: number | null | undefined, digits = 1, sign = false): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = (x * 100).toFixed(digits);
  return (sign && x > 0 ? "+" : "") + v + "%";
}

/** Parse "1,234.50" rupees to paise. Returns null if invalid. */
export function toPaise(input: string): number | null {
  const clean = input.replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function rupeesInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

// ---------------------------------------------------------------- dates

export function todayISO(): string {
  const d = new Date();
  return isoDate(d);
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d ?? 1);
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return isoDate(d).slice(0, 7);
}

export function monthLabel(month: string, style: "long" | "short" = "long"): string {
  return parseISO(month + "-01").toLocaleDateString("en-IN", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
  });
}

export function shortDate(s: string): string {
  return parseISO(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function dayHeading(s: string): string {
  const today = todayISO();
  const y = isoDate(new Date(Date.now() - 86400000));
  if (s === today) return "Today";
  if (s === y) return "Yesterday";
  return parseISO(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
