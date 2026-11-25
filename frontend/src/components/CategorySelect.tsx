import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category } from "../lib/api";
import { cn } from "../lib/utils";
import { CatBadge } from "./CatBadge";
import { Chevron, listKeys, panelClass, rowClass, SearchBox, TRIGGER, usePlacement, usePopover } from "./Dropdown";

interface CategorySelectProps {
  value: string | number;
  onChange: (id: string) => void;
  cats: Category[];
  kind?: "expense" | "income" | "all";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Taller list (shows more categories at once), e.g. for the Transactions filter. */
  tall?: boolean;
}

type Item = { id: string; label: string; cat?: Category; child?: boolean; general?: boolean };

export function CategorySelect({ value, onChange, cats, kind = "all", placeholder = "Uncategorised", className, disabled = false, tall = false }: CategorySelectProps) {
  const { open, setOpen, box } = usePopover();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const place = usePlacement(open, box, tall ? 520 : 340);

  const selectedCat = value ? (cats.find((c) => String(c.id) === String(value)) ?? null) : null;
  const parentCat = selectedCat?.parent_id ? (cats.find((c) => c.id === selectedCat.parent_id) ?? null) : null;

  // Groups: a top-level category with its children; search keeps matching groups.
  const groups = useMemo(() => {
    const live = cats.filter((c) => !c.archived && (kind === "all" || c.kind === kind));
    const q = search.trim().toLowerCase();
    return live
      .filter((c) => c.parent_id == null)
      .map((top) => {
        const kids = live.filter((c) => c.parent_id === top.id);
        if (!q) return { top, kids };
        const topHit = top.name.toLowerCase().includes(q);
        const kidHits = kids.filter((k) => topHit || k.name.toLowerCase().includes(q));
        return topHit || kidHits.length ? { top, kids: kidHits } : null;
      })
      .filter((g): g is { top: Category; kids: Category[] } => g !== null);
  }, [cats, kind, search]);

  // Flat, selectable rows in display order (drives keyboard navigation).
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (!search) out.push({ id: "", label: placeholder });
    for (const { top, kids } of groups) {
      out.push({ id: String(top.id), label: kids.length ? `${top.name} (general)` : top.name, cat: top, general: kids.length > 0 });
      for (const k of kids) out.push({ id: String(k.id), label: k.name, cat: k, child: true });
    }
    return out;
  }, [groups, search, placeholder]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setActive(0);
    setTimeout(() => searchRef.current?.focus(), 25);
  }, [open]);
  useEffect(() => setActive((a) => Math.max(0, Math.min(a, items.length - 1))), [items.length]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    onChange(it.id);
    setOpen(false);
  };

  const row = (it: Item, i: number) => {
    const selected = String(value ?? "") === it.id;
    return (
      <button
        key={it.id || "none"}
        type="button"
        role="option"
        aria-selected={selected}
        data-active={i === active}
        onClick={() => choose(i)}
        onMouseMove={() => active !== i && setActive(i)}
        className={cn(rowClass(selected, i === active), it.child && "pl-8", !it.id && !selected && "text-muted")}
      >
        <span className="flex min-w-0 items-center gap-2">
          {it.cat && !it.child && <CatBadge name={it.cat.name} color={it.cat.color} size="sm" />}
          <span className="truncate">{it.label}</span>
        </span>
        {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
      </button>
    );
  };

  let n = -1;
  const next = () => ++n;

  return (
    <div
      ref={box}
      className={cn("relative w-full", className)}
      onKeyDown={(e) => listKeys(e, { open, setOpen, count: items.length, active, setActive, choose })}
    >
      <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(TRIGGER, open && "border-accent/60")}>
        <span className="flex min-w-0 items-center gap-2">
          {selectedCat ? (
            <>
              <CatBadge name={selectedCat.name} color={selectedCat.color || parentCat?.color || "#71717a"} size="sm" />
              <span className="truncate">
                {parentCat && <span className="text-faint">{parentCat.name} / </span>}
                {selectedCat.name}
              </span>
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className={panelClass(place, true)}>
          <SearchBox value={search} onChange={(v) => { setSearch(v); setActive(0); }} placeholder="Filter categories…" inputRef={searchRef} />
          <div ref={list} role="listbox" className={cn("scrollbar-thin overflow-y-auto", tall ? "max-h-[min(28rem,60vh)]" : "max-h-64")}>
            {items.length === 0 ? (
              <div className="py-4 text-center text-xs text-faint">No matching categories</div>
            ) : (
              <>
                {!search && row(items[next()], n)}
                {groups.map(({ top, kids }) => (
                  <div key={top.id} className="mt-1 space-y-0.5 border-t border-line pt-1 first:mt-0 first:border-0 first:pt-0">
                    {row(items[next()], n)}
                    {kids.map(() => row(items[next()], n))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
