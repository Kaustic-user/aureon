import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category } from "../lib/api";
import { cn } from "../lib/utils";

interface CategorySelectProps {
  value: string | number;
  onChange: (id: string) => void;
  cats: Category[];
  kind?: "expense" | "income" | "all";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CategorySelect({
  value,
  onChange,
  cats,
  kind = "all",
  placeholder = "Uncategorised",
  className,
  disabled = false,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => searchInputRef.current?.focus(), 25);
    }
  }, [open]);

  const selectedCat = useMemo(() => {
    if (!value) return null;
    return cats.find((c) => String(c.id) === String(value)) ?? null;
  }, [cats, value]);

  const parentCat = useMemo(() => {
    if (!selectedCat?.parent_id) return null;
    return cats.find((c) => c.id === selectedCat.parent_id) ?? null;
  }, [cats, selectedCat]);

  const filteredCats = useMemo(() => {
    return cats.filter((c) => !c.archived && (kind === "all" || c.kind === kind));
  }, [cats, kind]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tops = filteredCats.filter((c) => c.parent_id == null);

    return tops
      .map((t) => {
        const children = filteredCats.filter((c) => c.parent_id === t.id);
        const matchesTop = !q || t.name.toLowerCase().includes(q);
        const matchingKids = children.filter(
          (k) => !q || k.name.toLowerCase().includes(q) || matchesTop
        );

        if (!q) {
          return { top: t, children };
        }
        if (matchesTop || matchingKids.length > 0) {
          return { top: t, children: matchingKids };
        }
        return null;
      })
      .filter((g): g is { top: Category; children: Category[] } => g !== null);
  }, [filteredCats, search]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={box} className={cn("relative inline-block w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "h-9 w-full rounded-md border border-line bg-bg px-3 text-sm text-left outline-none transition flex items-center justify-between gap-2 shadow-2xs cursor-pointer",
          "hover:border-zinc-700 hover:bg-hover/30",
          open && "border-accent ring-1 ring-accent/40",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className="truncate flex items-center gap-2">
          {selectedCat ? (
            <>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedCat.color || parentCat?.color || "#71717a" }}
              />
              <span className="truncate text-zinc-100 font-medium">
                {parentCat ? (
                  <>
                    <span className="text-faint font-normal">{parentCat.name} / </span>
                    {selectedCat.name}
                  </>
                ) : (
                  selectedCat.name
                )}
              </span>
            </>
          ) : (
            <span className="text-faint">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
            open && "rotate-180 text-accent"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-full min-w-[240px] max-w-sm rounded-lg border border-line bg-card p-1.5 shadow-2xl shadow-black/80">
          <div className="relative mb-1 px-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter categories…"
              className="h-8 w-full rounded border border-line bg-bg pl-8 pr-7 text-xs text-zinc-100 placeholder:text-faint outline-none focus:border-accent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-zinc-200 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto scrollbar-thin px-0.5 py-1 divide-y divide-line/40">
            {!search && (
              <div className="pb-1">
                <button
                  type="button"
                  onClick={() => select("")}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left transition cursor-pointer",
                    !value ? "bg-hover font-semibold text-accent" : "text-muted hover:bg-hover hover:text-zinc-200"
                  )}
                >
                  <span>{placeholder}</span>
                  {!value && <Check className="h-3.5 w-3.5 text-accent" />}
                </button>
              </div>
            )}

            {groups.length === 0 ? (
              <div className="py-4 text-center text-xs text-faint">No matching categories</div>
            ) : (
              groups.map(({ top, children }) => (
                <div key={top.id} className="py-1 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: top.color }} />
                      {top.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => select(String(top.id))}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2.5 py-1 text-xs text-left transition pl-4 cursor-pointer",
                      String(value) === String(top.id)
                        ? "bg-hover font-semibold text-accent"
                        : "text-zinc-300 hover:bg-hover hover:text-zinc-100"
                    )}
                  >
                    <span className="truncate">{children.length ? `${top.name} (general)` : top.name}</span>
                    {String(value) === String(top.id) && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>

                  {children.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => select(String(c.id))}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-2.5 py-1 text-xs text-left transition pl-6 cursor-pointer",
                        String(value) === String(c.id)
                          ? "bg-hover font-semibold text-accent"
                          : "text-zinc-400 hover:bg-hover hover:text-zinc-100"
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                      {String(value) === String(c.id) && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

