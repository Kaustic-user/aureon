import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard } from "../lib/api";
import { money, moneyCompact, monthLabel, parseISO } from "../lib/format";

// Chart colours. Income/spend use deeper steps than the text tokens so the pair
// keeps contrast on the dark card; the legend + fixed order (income left) make
// identity not colour-only.
export const CHART = {
  accent: "#2dd4bf",
  income: "#16a34a",
  spend: "#ef4444",
  grid: "#27272a",
  axis: "#71717a",
};

const axisProps = {
  stroke: CHART.axis,
  tickLine: false,
  axisLine: false,
  fontSize: 11,
} as const;

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-line bg-[#0b0b0d]/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-muted">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-zinc-300">
            {r.color && <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="maskable font-mono tabular-nums text-zinc-50">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function NetWorthChart({ data }: { data: Dashboard["net_worth_trend"] }) {
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.02, 100_00);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m) => monthLabel(m, "short")} interval="preserveStartEnd" minTickGap={24} />
        <YAxis
          {...axisProps}
          width={56}
          domain={[Math.max(0, min - pad), max + pad]}
          tickFormatter={moneyCompact}
          tickCount={4}
          className="maskable"
        />
        <Tooltip
          cursor={{ stroke: "#52525b", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as Dashboard["net_worth_trend"][number] | undefined;
            if (!active || !p) return null;
            const title = parseISO(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
            return <TipBox title={title} rows={[{ label: "Net worth", value: money(p.value), color: CHART.accent }]} />;
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART.accent}
          strokeWidth={2}
          fill="url(#nw-fill)"
          dot={false}
          activeDot={{ r: 4, stroke: "#0f0f11", strokeWidth: 2, fill: CHART.accent }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CashFlowChart({ data }: { data: Dashboard["cash_flow"] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => monthLabel(m, "short") + (data.find((d) => d.month === m)?.partial ? "*" : "")} />
        <YAxis {...axisProps} width={48} tickFormatter={moneyCompact} tickCount={4} className="maskable" />
        <Tooltip
          cursor={{ fill: "#ffffff08" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as Dashboard["cash_flow"][number] | undefined;
            if (!active || !p) return null;
            return (
              <TipBox
                title={monthLabel(p.month) + (p.partial ? " (to date)" : "")}
                rows={[
                  { label: "Income", value: money(p.income), color: CHART.income },
                  { label: "Spend", value: money(p.spent), color: CHART.spend },
                  { label: "Net", value: money(p.income - p.spent, { sign: true }) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="income" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28}>
          {data.map((d) => (
            <Cell key={d.month} fill={CHART.income} fillOpacity={d.partial ? 0.55 : 1} />
          ))}
        </Bar>
        <Bar dataKey="spent" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28}>
          {data.map((d) => (
            <Cell key={d.month} fill={CHART.spend} fillOpacity={d.partial ? 0.55 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <span className="flex items-center gap-3">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </span>
  );
}
