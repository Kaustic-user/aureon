import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, PiggyBank } from "lucide-react";
import { CatBadge } from "../components/CatBadge";
import { useState } from "react";
import { Amount, Button, Card, CardHeader, Empty, ErrorNote, Input, PageHeader, Progress, Skeleton } from "../components/ui";
import { api, type BudgetMonth, type BudgetRow } from "../lib/api";
import { money, monthLabel, rupeesInput, shiftMonth, toPaise } from "../lib/format";
import { useMonthParam } from "../lib/useMonth";
import { cn } from "../lib/utils";
import { MonthPicker } from "./Overview";

export default function Budgets() {
  const [month, setMonth] = useMonthParam();
  const qc = useQueryClient();
  const key = ["budgets", month];
  const { data, error, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<BudgetMonth>("/budgets", { month }) });

  const onSaved = (b: BudgetMonth) => {
    qc.setQueryData(key, b);
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const setBudget = useMutation({
    mutationFn: (v: { category_id: number; amount: number }) => api.put<BudgetMonth>("/budgets", { ...v, month }),
    onSuccess: onSaved,
  });
  const copy = useMutation({
    mutationFn: () => api.post<BudgetMonth>("/budgets/copy", undefined, { from_month: shiftMonth(month, -1), to_month: month }),
    onSuccess: onSaved,
  });

  const rows = data?.rows ?? [];
  const budgeted = rows.filter((r) => r.budget);
  const unbudgeted = rows.filter((r) => !r.budget);
  const totalRatio = data && data.total_budget ? data.total_spent_budgeted / data.total_budget : 0;

  return (
    <>
      <PageHeader
        title="Budgets"
        subtitle={`${monthLabel(month)} · monthly limits per category (subcategories roll up)`}
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} />
            <Button onClick={() => copy.mutate()} disabled={copy.isPending} title="Copy last month's budgets into this month">
              <Copy className="h-4 w-4" /> Copy {monthLabel(shiftMonth(month, -1), "short")}
            </Button>
          </>
        }
      />
      <ErrorNote error={error ?? setBudget.error ?? copy.error} />
      {isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-sm text-muted">Budgeted</div>
              <Amount value={data.total_budget} className="mt-2 block text-2xl font-bold" />
            </Card>
            <Card>
              <div className="text-sm text-muted">Spent in budgeted categories</div>
              <Amount value={data.total_spent_budgeted} className={cn("mt-2 block text-2xl font-bold", totalRatio > 1 && "text-expense")} />
              <Progress className="mt-3" value={totalRatio} tone={totalRatio > 1 ? "over" : totalRatio > 0.85 ? "warn" : "default"} />
            </Card>
            <Card>
              <div className="text-sm text-muted">Projected month-end</div>
              <div className="mt-2 text-2xl font-bold">
                {data.projected_spent != null ? <Amount value={data.projected_spent} /> : <span className="text-faint">—</span>}
              </div>
              <div className="mt-2 text-xs text-faint">
                All spending this month: <span className="maskable font-mono">{money(data.total_spent)}</span>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Categories" right="Type an amount and press Enter · 0 removes" />
            {rows.length === 0 ? (
              <Empty icon={<PiggyBank className="h-6 w-6" />} title="No expense categories" />
            ) : (
              <div className="divide-y divide-line/60">
                {[...budgeted, ...unbudgeted].map((r) => (
                  <BudgetLine key={r.category_id} row={r} saving={setBudget.isPending} onSave={(amount) => setBudget.mutate({ category_id: r.category_id, amount })} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function BudgetLine({ row, onSave, saving }: { row: BudgetRow; onSave: (paise: number) => void; saving: boolean }) {
  const [val, setVal] = useState(row.budget ? rupeesInput(row.budget) : "");
  const [prev, setPrev] = useState(row.budget);
  if (prev !== row.budget) {
    setPrev(row.budget);
    setVal(row.budget ? rupeesInput(row.budget) : "");
  }
  const ratio = row.budget ? row.spent / row.budget : 0;
  const commit = () => {
    const p = val.trim() === "" ? 0 : toPaise(val);
    if (p == null) return setVal(row.budget ? rupeesInput(row.budget) : "");
    if (p !== (row.budget ?? 0)) onSave(p);
  };
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[200px_1fr_auto]">
      <div className="flex items-center gap-2 text-sm">
        <CatBadge name={row.name} color={row.color} size="sm" />
        {row.name}
      </div>
      <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
        {row.budget ? (
          <div className="flex items-center gap-3">
            <Progress value={ratio} color={row.color} tone={ratio > 1 ? "over" : ratio > 0.85 ? "warn" : "default"} />
            <span className={cn("maskable w-40 shrink-0 text-right font-mono text-xs tabular-nums", ratio > 1 ? "text-expense" : "text-muted")}>
              {money(row.spent)} {ratio > 1 ? `· ${money(row.spent - row.budget)} over` : `· ${money(row.budget - row.spent)} left`}
            </span>
          </div>
        ) : (
          <span className="text-xs text-faint">{row.spent ? <>Spent <span className="maskable font-mono">{money(row.spent)}</span> · no budget</> : "No budget"}</span>
        )}
      </div>
      <div className="relative w-32">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">₹</span>
        <Input
          value={val}
          inputMode="decimal"
          disabled={saving}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="—"
          className="maskable pl-7 text-right font-mono tabular-nums"
        />
      </div>
    </div>
  );
}
