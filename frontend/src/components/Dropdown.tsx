// Shared look for every dropdown (Select, CategorySelect): same panel, rows and
// selected state as the calendar popovers.
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { cn } from "../lib/utils";

export const TRIGGER =
  "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 text-left text-sm font-normal text-zinc-100 transition hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export function panelClass({ up, right }: Placement, wide = false) {
  return cn(
    "absolute z-50 w-full max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-card p-1.5 shadow-2xl shadow-black/40",
    wide ? "min-w-[15rem]" : "min-w-[11rem]",
    "sm:max-w-sm",
    right ? "right-0" : "left-0",
    up ? "bottom-full mb-2" : "top-full mt-2",
  );
}

export function rowClass(selected: boolean, active: boolean, disabled?: boolean) {
  return cn(
    "flex min-h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition",
    selected ? "bg-accent/15 font-medium text-accent" : "text-zinc-200",
    !selected && (active ? "bg-hover text-zinc-50" : "hover:bg-hover hover:text-zinc-50"),
    selected && active && "bg-accent/20",
    disabled && "pointer-events-none opacity-40",
  );
}

/** The trigger's chevron. */
export function Chevron({ open }: { open: boolean }) {
  return <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180 text-accent")} />;
}

/** Open/close state for a popover: closes on outside click and Escape (without closing a parent dialog). */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, box };
}

export type Placement = { up: boolean; right: boolean };

/**
 * Where the panel should open: upwards when there is more room above, and
 * right-aligned when opening left-aligned would run past the viewport edge
 * (which would otherwise make the whole page scroll sideways).
 */
export function usePlacement(open: boolean, box: RefObject<HTMLElement | null>, need = 280, width = 240): Placement {
  const [p, setP] = useState<Placement>({ up: false, right: false });
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setP({ up: below < need && r.top > below, right: r.left + width > window.innerWidth - 16 && r.right - width >= 8 });
  }, [open, box, need, width]);
  return p;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative mb-1.5">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-line bg-bg pl-8 pr-7 text-sm text-zinc-100 outline-none transition placeholder:text-faint focus:border-accent/60"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-zinc-200">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Arrow / Home / End / Enter handling over a flat list of `count` rows. */
export function listKeys(
  e: KeyboardEvent,
  { open, setOpen, count, active, setActive, choose }: { open: boolean; setOpen: (o: boolean) => void; count: number; active: number; setActive: (i: number) => void; choose: (i: number) => void },
) {
  if (!open) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActive(Math.min(count - 1, active + 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActive(Math.max(0, active - 1));
  } else if (e.key === "Home") {
    e.preventDefault();
    setActive(0);
  } else if (e.key === "End") {
    e.preventDefault();
    setActive(count - 1);
  } else if (e.key === "Enter" && active >= 0 && active < count) {
    e.preventDefault();
    choose(active);
  }
}
