import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Landmark, PiggyBank, Repeat } from "lucide-react";
import { Link } from "react-router";
import { MonthGrid, POPOVER, usePopover } from "../components/Calendar";
import { CatBadge } from "../components/CatBadge";
import { CashFlowChart, CHART, Legend, NetWorthChart, PaceChart, SavingsBars } from "../components/charts";
import { Amount, Card, CardHeader, Delta, Empty, ErrorNote, PageHeader, Progress, Skeleton, Button } from "../components/ui";
import type { Dashboard } from "../lib/api";
import { useActions } from "../lib/actions";
import { currentMonth, money, monthLabel, pct, shiftMonth, shortDate } from "../lib/format";
import { useDashboard } from "../lib/queries";
import { useMonthParam } from "../lib/useMonth";
import { cn } from "../lib/utils";

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month >= currentMonth();
  const { open, setOpen, box } = usePopover();
  return (
    <div ref={box} className="relative">
      <div className="flex items-center rounded-md border border-line">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="flex h-9 min-w-32 items-center justify-center gap-2 border-x border-line px-3 text-sm hover:bg-hover"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title="Pick month and year"
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted" />
          {month === currentMonth() ? "This month" : monthLabel(month)}
        </button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => onChange(shiftMonth(month, 1))} disabled={isCurrent} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className={`absolute right-0 ${POPOVER}`}>
          <MonthGrid
            value={month}
            max={currentMonth()}
            onPick={(m) => {
              onChange(m);
              setOpen(false);
            }}
          />
          <div className="mt-2 border-t border-line pt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(currentMonth());
                setOpen(false);
              }}
            >
              This month
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, children, caption, tone, icon }: { label: string; children: React.ReactNode; caption: React.ReactNode; tone: string; icon: React.ReactNode }) {
  return (
    <Card className="transition hover:border-zinc-700 hover:bg-hover">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: `color-mix(in oklab, ${tone} 16%, transparent)`, color: tone }}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{children}</div>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5 text-xs text-faint">{caption}</div>
    </Card>
  );
}

export default function Overview() {
  const [month, setMonth] = useMonthParam();
  const { data, error, isLoading } = useDashboard(month);
  const { openTxn } = useActions();

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={data ? `${monthLabel(month)}${data.as_of < `${month}-31` && month === currentMonth() ? ` · to ${shortDate(data.as_of)}` : ""}` : monthLabel(month)}
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />
      <ErrorNote error={error} />
      {isLoading || !data ? <OverviewSkeleton /> : data.net_worth_trend.length === 0 && data.income.total === 0 && data.spent.total === 0 ? (
        <Card>
          <Empty title="Welcome to Aureon" icon={<CalendarClock className="h-6 w-6" />}>
            Add your accounts with their current balances, then record expenses with the button above or Ctrl K.
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/accounts"><Button>Set up accounts</Button></Link>
              <Button variant="primary" onClick={() => openTxn()}>Add first expense</Button>
            </div>
          </Empty>
        </Card>
      ) : (
        <Blocks d={data} />
      )}
    </>
  );
}

function Blocks({ d }: { d: Dashboard }) {
  const prevLabel = monthLabel(shiftMonth(d.month, -1), "short");
  const split = d.income.split.map((s) => `${s.name} ${money(s.amount)}`).join(" · ");
  const pf = d.portfolio.totals;
  const spendTotal = d.spend_by_category.reduce((a, c) => a + c.amount, 0);
  const maxCat = d.spend_by_category[0]?.amount ?? 1;
  const budgetRows = d.budgets.rows.filter((r) => r.budget).sort((a, b) => b.spent / b.budget! - a.spent / a.budget!);

  // Pace: compare spend so far with where last month stood on the same day.
  const reached = d.daily_spend.filter((p) => p.current != null);
  const lastDay = reached[reached.length - 1];
  const paceDiff = lastDay && lastDay.previous != null ? lastDay.current! - lastDay.previous : null;

  return (
    <>
      {/* KPI ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi tone="var(--color-accent)" icon={<Landmark className="h-3.5 w-3.5" />} label="Net worth" caption={<><Delta value={d.net_worth.change_3m_pct} /> <span>last 3 months</span></>}>
          <Amount value={d.net_worth.value} className="font-bold" />
        </Kpi>
        <Kpi tone="var(--color-income)" icon={<ArrowDownLeft className="h-3.5 w-3.5" />} label="Income" caption={<span className="maskable truncate">{split || "No income recorded"}</span>}>
          <Amount value={d.income.total} kind="income" className="font-bold" />
        </Kpi>
        <Kpi tone="var(--color-expense)" icon={<ArrowUpRight className="h-3.5 w-3.5" />} label="Spent" caption={d.spent.previous ? <><Delta value={d.spent.change_pct} invert /> <span>vs {prevLabel}</span></> : <span>No spend last month</span>}>
          <Amount value={d.spent.total} kind="expense" className="font-bold" />
        </Kpi>
        <Kpi
          tone="#8b5cf6"
          icon={<PiggyBank className="h-3.5 w-3.5" />}
          label="Savings rate"
          caption={<span><span className="maskable font-mono">{money(d.savings.amount)}</span> saved{d.invested ? <> · <span className="maskable font-mono">{money(d.invested)}</span> invested</> : null}</span>}
        >
          <span className={cn("font-mono tabular-nums", (d.savings.rate ?? 0) < 0 && "text-expense")}>{pct(d.savings.rate, 0)}</span>
        </Kpi>
      </div>

      {/* Trend + upcoming */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Net worth trend" right={<Legend items={[{ label: "Net worth", color: CHART.accent }]} />} />
          {d.net_worth_trend.length >= 3 ? (
            <NetWorthChart data={d.net_worth_trend} />
          ) : (
            <Empty title="The trend chart appears after 3 months of data">
              {d.net_worth_trend.length} month{d.net_worth_trend.length === 1 ? "" : "s"} recorded so far. Until then, your net worth is the figure above.
            </Empty>
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming" right={<span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> next 30 days</span>} />
          {d.upcoming.length ? (
            <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
              {d.upcoming.map((u) => (
                <li key={`${u.rule_id}-${u.date}`} className="relative flex items-start justify-between gap-3 pl-6">
                  <span className={cn("absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-card", u.overdue ? "bg-warn" : u.kind === "income" ? "bg-income" : "bg-zinc-500")} />
                  <div className="min-w-0">
                    <div className="truncate text-sm">{u.name}</div>
                    <div className="text-xs text-faint">{shortDate(u.date)}{u.overdue && <span className="text-warn"> · due</span>}</div>
                  </div>
                  <Amount value={u.amount} kind={u.kind === "income" ? "income" : undefined} className="text-sm" />
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="Nothing scheduled">Recurring bills and salary show here.</Empty>
          )}
        </Card>
      </div>

      {/* Cash flow + spending pace */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Cash flow · last 6 months" right={<Legend items={[{ label: "Income", color: CHART.income }, { label: "Spend", color: CHART.spend }]} />} />
          <CashFlowChart data={d.cash_flow} />
          {d.cash_flow.some((c) => c.partial) && <p className="mt-2 text-xs text-faint">* month to date</p>}
        </Card>
        <Card>
          <CardHeader
            title="Spending pace"
            right={
              <Legend
                items={[
                  { label: monthLabel(d.month, "short"), color: CHART.accent },
                  { label: monthLabel(shiftMonth(d.month, -1), "short"), color: CHART.ref, dashed: true },
                ]}
              />
            }
          />
          {d.spent.total > 0 || d.spent.previous > 0 ? (
            <>
              <PaceChart data={d.daily_spend} month={d.month} />
              {paceDiff != null && (
                <p className="mt-2 text-xs text-faint">
                  By day {lastDay!.day} you've spent{" "}
                  <span className={cn("maskable font-mono", paceDiff > 0 ? "text-expense" : "text-income")}>{money(Math.abs(paceDiff))}</span>{" "}
                  {paceDiff > 0 ? "more" : "less"} than at the same point in {prevLabel}.
                </p>
              )}
            </>
          ) : (
            <Empty title="No spending to compare yet" />
          )}
        </Card>
      </div>

      {/* Category + budgets */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Spend by category" right={<span className="maskable font-mono">{money(spendTotal)} total</span>} />
          {d.spend_by_category.length ? (
            <div className="space-y-3.5">
              {d.spend_by_category.slice(0, 8).map((c) => (
                <Link key={c.name} to={`/transactions?month=${d.month}${c.category_id ? `&category_id=${c.category_id}` : ""}`} className="group block">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 group-hover:text-zinc-50">
                      <CatBadge name={c.name} color={c.color} size="sm" />
                      {c.name}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xs text-faint">{pct(c.amount / spendTotal, 0)}</span>
                      <Amount value={c.amount} className="text-sm" />
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full opacity-90 transition group-hover:opacity-100" style={{ width: `${(c.amount / maxCat) * 100}%`, background: c.color }} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No spending this month" />
          )}
        </Card>
        <Card>
          <CardHeader title={`Budgets · ${monthLabel(d.month, "short")}`} right={<Link to={`/budgets?month=${d.month}`} className="hover:text-zinc-200">{budgetRows.length > 3 ? `All ${budgetRows.length}` : "Manage"}</Link>} />
          {budgetRows.length ? (
            <div className="space-y-3.5">
              {budgetRows.slice(0, 3).map((r) => {
                const ratio = r.spent / r.budget!;
                return (
                  <div key={r.category_id}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2"><CatBadge name={r.name} color={r.color} size="sm" />{r.name}</span>
                      <span className={cn("maskable font-mono text-xs tabular-nums", ratio > 1 ? "text-expense" : "text-muted")}>
                        {money(r.spent)} / {money(r.budget!)}
                      </span>
                    </div>
                    <Progress value={ratio} color={r.color} tone={ratio > 1 ? "over" : ratio > 0.85 ? "warn" : "default"} />
                  </div>
                );
              })}
              {d.budgets.projected_spent != null && (
                <p className="pt-1 text-xs text-faint">
                  Projected month-end spend <span className="maskable font-mono">{money(d.budgets.projected_spent)}</span> of{" "}
                  <span className="maskable font-mono">{money(d.budgets.total_budget)}</span> budgeted
                </p>
              )}
            </div>
          ) : (
            <Empty title="No budgets this month">
              <Link to={`/budgets?month=${d.month}`} className="text-accent hover:underline">Set budgets</Link> per category to track pace.
            </Empty>
          )}
        </Card>
      </div>

      {/* Top 10 + portfolio & savings */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Top 10 transactions" right={<Link to={`/transactions?month=${d.month}`} className="hover:text-zinc-200">View all</Link>} />
          {d.top_transactions.length ? (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-faint">
                    <th className="px-4 pb-2 font-medium">Merchant</th>
                    <th className="pb-2 font-medium">Category</th>
                    <th className="px-4 pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.top_transactions.map((t) => (
                    <tr key={t.id} className="border-b border-line/60 last:border-0 hover:bg-hover">
                      <td className="px-4 py-2">
                        <div className="max-w-[180px] truncate">{t.merchant ?? t.note ?? "—"}</div>
                        <div className="text-xs text-faint">{shortDate(t.date)}</div>
                      </td>
                      <td className="py-2 text-muted">{t.category ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <Amount value={t.amount} kind={t.kind === "income" ? "income" : "expense"} sign />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No transactions this month" />
          )}
        </Card>
        <div className="space-y-4">
        <Card>
          <CardHeader title="Portfolio" right={<Link to="/investments" className="flex items-center gap-1 hover:text-zinc-200">Investments <ArrowRight className="h-3 w-3" /></Link>} />
          {pf.invested > 0 || pf.value > 0 ? (
            <>
              <Amount value={pf.value} className="text-2xl font-bold" />
              <div className="mt-2 flex items-center gap-1.5 text-xs text-faint">
                <Delta value={pf.unrealized_pct} /> <span>unrealised</span>
                {pf.xirr != null && <span>· XIRR <span className="font-mono">{pct(pf.xirr)}</span></span>}
              </div>
              <div className="mt-4 divide-y divide-line/60 text-sm">
                {(["mutual_fund", "stock"] as const).map((k) => {
                  const t = d.portfolio.by_kind[k];
                  if (!t) return null;
                  return (
                    <div key={k} className="flex items-center justify-between py-2">
                      <span>{k === "mutual_fund" ? "Mutual funds" : "Stocks"}</span>
                      <span className="flex items-baseline gap-3">
                        <Amount value={t.value} className="text-muted" />
                        <span className={cn("w-16 text-right font-mono text-xs tabular-nums", (t.unrealized_pct ?? 0) >= 0 ? "text-income" : "text-expense")}>
                          {pct(t.unrealized_pct, 1, true)}
                        </span>
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between py-2">
                  <span>Day change</span>
                  <Amount value={pf.day_change} kind="gain" />
                </div>
              </div>
              {pf.missing_prices > 0 && <p className="mt-2 text-xs text-warn">{pf.missing_prices} holding(s) have no price yet — valued at cost.</p>}
            </>
          ) : (
            <Empty title="No investments yet"><Link to="/investments" className="text-accent hover:underline">Add a mutual fund or stock</Link></Empty>
          )}
        </Card>
        <Card>
          <CardHeader title="Savings by month" right={<span>{d.income.total ? `${pct(d.savings.rate, 0)} of income this month` : ""}</span>} />
          <SavingsBars data={d.cash_flow} />
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <Mini label="Earned" value={d.income.total} />
            <Mini label="Spent" value={d.spent.total} />
            <Mini label="Invested" value={d.invested} />
          </div>
        </Card>
        </div>
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line p-2.5">
      <div className="text-faint">{label}</div>
      <Amount value={value} className="mt-1 block text-sm text-zinc-200" />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px]" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[310px] lg:col-span-2" />
        <Skeleton className="h-[310px]" />
      </div>
    </>
  );
}
