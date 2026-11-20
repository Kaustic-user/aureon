import { CornerDownLeft, Sparkles, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money, shortDate, todayISO } from "../lib/format";
import { useAccounts, useCategories, useSaveTxn } from "../lib/queries";
import { parseQuick } from "../lib/quickadd";
import type { TxnDraft } from "./TxnDialog";
import { ErrorNote } from "./ui";

/** ⌘K palette: type "240 chai at Blue Tokai" and press Enter. */
export function QuickAdd({ open, onClose, onExpand }: { open: boolean; onClose: () => void; onExpand: (d: TxnDraft) => void }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const save = useSaveTxn();

  useEffect(() => {
    if (open) {
      setText("");
      save.reset();
      setTimeout(() => input.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = useMemo(() => parseQuick(text, accounts, cats), [text, accounts, cats]);
  const defaultAccount = accounts.find((a) => !a.archived && a.type === "bank") ?? accounts.find((a) => !a.archived);
  const accountId = parsed.accountId ?? defaultAccount?.id ?? null;
  const cat = cats.find((c) => c.id === parsed.categoryId);
  const acc = accounts.find((a) => a.id === accountId);
  const ready = parsed.amount != null && parsed.amount > 0 && accountId != null;

  const draft = (): TxnDraft => ({
    kind: parsed.kind,
    amount: parsed.amount ?? undefined,
    date: parsed.date,
    account_id: accountId ?? undefined,
    category_id: parsed.categoryId,
    merchant: parsed.merchant,
  });

  function submit() {
    if (!ready) return onExpand(draft());
    save.mutate(
      {
        body: {
          kind: parsed.kind,
          amount: parsed.amount!,
          date: parsed.date,
          account_id: accountId!,
          to_account_id: null,
          category_id: parsed.categoryId,
          merchant: parsed.merchant,
          note: null,
        },
      },
      { onSuccess: onClose },
    );
  }

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-line bg-card shadow-2xl shadow-black/60" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) onExpand(draft());
                else submit();
              }
            }}
            placeholder='240 chai at Blue Tokai · salary 80000 · 1.2k uber yesterday from cash'
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
        <div className="space-y-3 px-4 py-3">
          {text.trim() ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Preview label="Amount" value={parsed.amount ? money(parsed.amount, { exact: parsed.amount % 100 !== 0 }) : "—"} mono tone={parsed.kind} />
              <Preview label="Category" value={cat?.name ?? "Uncategorised"} />
              <Preview label="Account" value={acc?.name ?? "—"} />
              <Preview label="Date" value={parsed.date === todayISO() ? "Today" : shortDate(parsed.date)} />
              {parsed.merchant && <Preview label="Merchant" value={parsed.merchant} className="col-span-2 sm:col-span-4" />}
            </div>
          ) : (
            <p className="text-xs text-muted">
              Start with an amount. Add <Kbd>at</Kbd> merchant, <Kbd>from</Kbd> account, or <Kbd>yesterday</Kbd>. Words like chai, uber, rent or salary pick a category.
            </p>
          )}
          <ErrorNote error={save.error} />
        </div>
        <div className="flex items-center justify-between border-t border-line bg-bg/50 px-4 py-2 text-xs text-faint">
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" /> <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> to edit details
          </span>
          <span className="flex items-center gap-1.5">
            {save.isPending ? "Saving…" : ready ? "Add" : "Open form"} <Kbd><CornerDownLeft className="inline h-3 w-3" /></Kbd>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Preview({ label, value, mono, tone, className }: { label: string; value: string; mono?: boolean; tone?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`truncate ${mono ? "font-mono tabular-nums" : ""} ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-hover px-1 py-px font-mono text-[10px] text-muted">{children}</kbd>;
}
