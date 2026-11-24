// Small shadcn-style primitives, hand-written so there is no generator step.
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
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
  primary: "bg-accent text-[var(--color-on-accent)] hover:brightness-110 border-transparent",
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

interface ParsedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

function extractOptions(children: ReactNode): ParsedOption[] {
  const result: ParsedOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const elem = child as ReactElement<any>;
    if (elem.type === "option") {
      result.push({
        value: String(elem.props.value ?? ""),
        label: elem.props.children ?? elem.props.value,
        disabled: elem.props.disabled,
      });
    } else if (elem.type === "optgroup") {
      Children.forEach(elem.props.children, (opt) => {
        if (!isValidElement(opt)) return;
        const o = opt as ReactElement<any>;
        result.push({
          value: String(o.props.value ?? ""),
          label: o.props.children ?? o.props.value,
          disabled: o.props.disabled,
        });
      });
    }
  });
  return result;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "placeholder"> {
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  options?: { value: string; label: ReactNode; disabled?: boolean }[];
  searchable?: boolean;
  placeholder?: string;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    value,
    onChange,
    children,
    options: directOptions,
    className,
    disabled = false,
    placeholder = "Select…",
    searchable,
    name,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    if (directOptions) return directOptions;
    return extractOptions(children);
  }, [directOptions, children]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showSearch = searchable ?? options.length > 7;

  useEffect(() => {
    if (open) {
      setQuery("");
      if (showSearch) {
        setTimeout(() => searchRef.current?.focus(), 25);
      }
    }
  }, [open, showSearch]);

  const selectedOpt = useMemo(() => {
    return options.find((o) => String(o.value) === String(value ?? "")) ?? null;
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      const text = typeof o.label === "string" ? o.label : String(o.value);
      return text.toLowerCase().includes(q);
    });
  }, [options, query]);

  const handleSelect = (optVal: string) => {
    if (onChange) {
      const syntheticEvent = {
        target: { value: optVal, name: name ?? "" },
        currentTarget: { value: optVal, name: name ?? "" },
      } as ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
    setOpen(false);
  };

  const isAuto = className?.includes("w-auto");

  return (
    <div ref={box} className={cn("relative inline-block", isAuto ? "w-auto min-w-[130px]" : className?.includes("w-") ? className : "w-full")}>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          field,
          "cursor-pointer pr-8 font-normal shadow-2xs transition flex items-center justify-between text-left",
          "hover:border-zinc-700 hover:bg-hover/30",
          open && "border-accent ring-1 ring-accent/40",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <span className="truncate text-zinc-100 font-medium">
          {selectedOpt ? selectedOpt.label : <span className="text-faint">{placeholder}</span>}
        </span>
        <ChevronDown
          className={cn(
            "pointer-events-none h-4 w-4 shrink-0 text-muted transition-transform duration-200",
            open && "rotate-180 text-accent"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-full min-w-[180px] max-w-sm rounded-lg border border-line bg-card p-1 shadow-2xl shadow-black/80">
          {showSearch && (
            <div className="relative mb-1 px-1 pt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded border border-line bg-bg pl-8 pr-7 text-xs text-zinc-100 placeholder:text-faint outline-none focus:border-accent"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-zinc-200 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          <div className="max-h-56 overflow-y-auto scrollbar-thin divide-y divide-line/40 p-0.5">
            {filteredOptions.length === 0 ? (
              <div className="py-3 text-center text-xs text-faint">No options found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value ?? "");
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left transition cursor-pointer",
                      isSelected
                        ? "bg-hover font-semibold text-accent"
                        : "text-zinc-200 hover:bg-hover hover:text-zinc-100",
                      opt.disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
                    )}
                  >
                    <span className="truncate pr-2">{opt.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});

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
            value === o.value ? "bg-hover text-zinc-50 shadow-[inset_0_0_0_1px_var(--color-zinc-700)]" : "text-muted hover:text-zinc-200",
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

/** `color` tints the bar in the default tone (e.g. a category colour); warn/over keep their status colours. */
export function Progress({ value, tone = "default", color, className }: { value: number; tone?: "default" | "warn" | "over" | "good"; color?: string; className?: string }) {
  const toneClass = { default: "bg-accent", warn: "bg-warn", over: "bg-expense", good: "bg-income" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-800", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", toneClass)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, ...(tone === "default" && color ? { background: color } : {}) }} />
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
