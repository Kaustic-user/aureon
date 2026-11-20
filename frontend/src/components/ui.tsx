// Small shadcn-style primitives, hand-written so there is no generator step.
import { X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { money } from "../lib/format";
import { cn } from "../lib/utils";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-card p-4", className)} {...p} />;
}

export function CardHeader({ title, right, className }: { title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      {right && <div className="text-xs text-muted">{right}</div>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-zinc-50 text-zinc-950 hover:bg-zinc-200 border-transparent",
  secondary: "bg-transparent text-zinc-100 border-line hover:bg-hover",
  ghost: "bg-transparent text-muted border-transparent hover:bg-hover hover:text-zinc-100",
  danger: "bg-transparent text-expense border-line hover:bg-red-500/10",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "icon" }
>(function Button({ className, variant = "secondary", size = "md", type = "button", ...p }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-md border text-sm font-medium transition active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        size === "md" && "h-9 px-3",
        size === "sm" && "h-8 px-2.5 text-xs",
        size === "icon" && "h-9 w-9",
        variants[variant],
        className,
      )}
      {...p}
    />
  );
});

const field =
  "h-9 w-full rounded-md border border-line bg-bg px-3 text-sm text-zinc-100 placeholder:text-faint outline-none transition focus:border-zinc-500 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...p },
  ref,
) {
  return <input ref={ref} className={cn(field, className)} {...p} />;
});

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "cursor-pointer pr-8", className)} {...p}>
      {children}
    </select>
  );
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

/** Segmented control, e.g. Expense | Income | Transfer. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-bg p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded px-3 text-xs font-medium transition",
            value === o.value ? "bg-hover text-zinc-50 shadow-[inset_0_0_0_1px_#3f3f46]" : "text-muted hover:text-zinc-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const first = panel.current?.querySelector<HTMLElement>("input,select,textarea,button[data-autofocus]");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn("w-full rounded-lg border border-line bg-card shadow-2xl shadow-black/50", wide ? "max-w-2xl" : "max-w-md")}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 p-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Amount in mono tabular digits, coloured by kind, blurred in privacy mode. */
export function Amount({
  value,
  kind,
  sign,
  exact,
  className,
}: {
  value: number;
  kind?: "income" | "expense" | "transfer" | "gain";
  sign?: boolean;
  exact?: boolean;
  className?: string;
}) {
  let text = money(value, { exact, sign });
  let color = "";
  if (kind === "income") {
    color = "text-income";
    if (sign) text = "+" + money(Math.abs(value), { exact });
  } else if (kind === "expense") {
    color = "text-expense";
    if (sign) text = "−" + money(Math.abs(value), { exact });
  } else if (kind === "gain") {
    color = value > 0 ? "text-income" : value < 0 ? "text-expense" : "text-muted";
    text = money(value, { exact, sign: true });
  }
  return <span className={cn("maskable font-mono tabular-nums", color, className)}>{text}</span>;
}

export function Delta({ value, suffix, invert }: { value: number | null | undefined; suffix?: string; invert?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-faint">—</span>;
  const good = invert ? value < 0 : value > 0;
  const neutral = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums",
        neutral ? "bg-zinc-800 text-muted" : good ? "bg-green-500/10 text-income" : "bg-red-500/10 text-expense",
      )}
    >
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"} {Math.abs(value * 100).toFixed(1)}%{suffix}
    </span>
  );
}

export function Progress({ value, tone = "default", className }: { value: number; tone?: "default" | "warn" | "over" | "good"; className?: string }) {
  const color = { default: "bg-zinc-200", warn: "bg-warn", over: "bg-expense", good: "bg-income" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-800", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {children && <div className="max-w-sm text-xs text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-800/60", className)} />;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-expense">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
