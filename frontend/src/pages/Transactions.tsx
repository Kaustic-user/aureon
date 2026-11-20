import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Plus, Receipt, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CategoryOptions, txnToDraft } from "../components/TxnDialog";
import { Amount, Button, Card, Empty, ErrorNote, Input, PageHeader, Select, Skeleton } from "../components/ui";
import { useActions } from "../lib/actions";
import { api, type Txn, type TxnPage } from "../lib/api";
import { dayHeading, money, monthLabel } from "../lib/format";
import { categoryIndex, useAccounts, useCategories } from "../lib/queries";
import { useMonthParam } from "../lib/useMonth";
import { cn } from "../lib/utils";
import { MonthPicker } from "./Overview";

const PAGE = 100;

export default function Transactions() {
  const [month, setMonth] = useMonthParam();
  const [params, setParams] = useSearchParams();
  const { openTxn } = useActions();
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const idx = useMemo(() => categoryIndex(cats), [cats]);
  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  const kind = params.get("kind") ?? "";
  const accountId = params.get("account_id") ?? "";
  const categoryId = params.get("category_id") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setLimit(PAGE), [month, kind, accountId, categoryId, debouncedQ]);

  const setParam = (k: string, v: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v) n.set(k, v);
      else n.delete(k);
      return n;
    }, { replace: true });

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ["transactions", month, kind, accountId, categoryId, debouncedQ, limit],
    queryFn: () =>
      api.get<TxnPage>("/transactions", {
        // A search looks across all time; otherwise scope to the month.
        month: debouncedQ ? undefined : month,
        kind,
        account_id: accountId,
        category_id: categoryId,
        q: debouncedQ,
        limit,
      }),
    placeholderData: (p) => p,
  });

  const groups = useMemo(() => {
    const out: { date: string; items: Txn[]; net: number }[] = [];
    for (const t of data?.items ?? []) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) out.push((g = { date: t.date, items: [], net: 0 }));
      g.items.push(t);
      g.net += t.kind === "income" ? t.amount : t.kind === "expense" ? -t.amount : 0;
    }
    return out;
  }, [data]);

  const filtered = kind || accountId || categoryId || debouncedQ;

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={debouncedQ ? `Searching all time for “${debouncedQ}”` : monthLabel(month)}
        actions={
          <>
            {!debouncedQ && <MonthPicker month={month} onChange={setMonth} />}
            <Button variant="primary" onClick={() => openTxn({ kind: (kind as "income") || "expense" })}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or note" className="pl-9" />
        </div>
        <Select value={kind} onChange={(e) => setParam("kind", e.target.value)} className="w-auto">
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </Select>
        <Select value={accountId} onChange={(e) => setParam("account_id", e.target.value)} className="w-auto">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select value={categoryId} onChange={(e) => setParam("category_id", e.target.value)} className="w-auto max-w-52">
          <option value="">All categories</option>
          <CategoryOptions cats={cats} kind="expense" />
          <CategoryOptions cats={cats} kind="income" />
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ("");
              setParams(month ? new URLSearchParams(params.get("month") ? { month } : {}) : {}, { replace: true });
            }}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </Card>

      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Summary label="Income" value={<Amount value={data.sum_income} kind="income" />} />
          <Summary label="Spent" value={<Amount value={data.sum_expense} kind="expense" />} />
          <Summary label={`${data.total} transaction${data.total === 1 ? "" : "s"}`} value={<Amount value={data.sum_income - data.sum_expense} kind="gain" />} />
        </div>
      )}

      <ErrorNote error={error} />
      <Card className={cn("p-0 transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : groups.length === 0 ? (
          <Empty icon={<Receipt className="h-6 w-6" />} title={filtered ? "No matching transactions" : "No transactions this month"}>
            Press Ctrl K anywhere to add one quickly.
          </Empty>
        ) : (
          <div>
            {groups.map((g) => (
              <section key={g.date}>
                <div className="sticky top-14 z-10 flex items-center justify-between border-b border-line bg-card/95 px-4 py-2 text-xs backdrop-blur">
                  <span className="font-medium text-muted">{dayHeading(g.date)}</span>
                  <span className={cn("maskable font-mono tabular-nums", g.net >= 0 ? "text-faint" : "text-faint")}>{money(g.net, { sign: true })}</span>
                </div>
                <ul>
                  {g.items.map((t) => {
                    const c = t.category_id != null ? idx.byId.get(t.category_id) : undefined;
                    const top = idx.top(t.category_id);
                    const color = t.kind === "transfer" ? "#71717a" : top?.color ?? "#52525b";
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => openTxn(txnToDraft(t))}
                          className="flex w-full items-center gap-3 border-b border-line/50 px-4 py-2.5 text-left transition hover:bg-hover active:bg-zinc-800/60"
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-semibold" style={{ background: color + "22", color }}>
                            {t.kind === "transfer" ? <ArrowLeftRight className="h-3.5 w-3.5" /> : (c?.name ?? "?").charAt(0)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">
                              {t.merchant ?? (t.kind === "transfer" ? "Transfer" : c?.name ?? "Untitled")}
                            </span>
                            <span className="block truncate text-xs text-faint">
                              {t.kind === "transfer"
                                ? `${accName.get(t.account_id)} → ${accName.get(t.to_account_id!)}`
                                : `${c?.name ?? "Uncategorised"} · ${accName.get(t.account_id) ?? ""}`}
                              {t.note ? ` · ${t.note}` : ""}
                            </span>
                          </span>
                          <Amount
                            value={t.amount}
                            kind={t.kind === "transfer" ? undefined : t.kind}
                            sign={t.kind !== "transfer"}
                            exact={t.amount % 100 !== 0}
                            className={cn("text-sm", t.kind === "transfer" && "text-muted")}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {data && data.items.length < data.total && (
              <div className="p-3 text-center">
                <Button onClick={() => setLimit((l) => l + PAGE)} disabled={isFetching}>
                  Show more ({data.total - data.items.length} left)
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-faint">{label}</div>
      <div className="mt-1 text-base font-semibold sm:text-lg">{value}</div>
    </Card>
  );
}
