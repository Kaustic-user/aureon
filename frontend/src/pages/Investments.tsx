import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Loader2, Plus, RefreshCw, Search, Tag, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CHART, Legend, PortfolioChart } from "../components/charts";
import { DateField } from "../components/Calendar";
import { Amount, Button, Card, CardHeader, Dialog, Empty, ErrorNote, Field, Input, PageHeader, Segmented, Select, Skeleton } from "../components/ui";
import { api, type AmfiScheme, type Holding, type Instrument, type InstrumentKind, type InvTxn } from "../lib/api";
import { money, pct, rupeesInput, shortDate, todayISO, toPaise } from "../lib/format";
import { useAccounts, useInvalidateAll, usePortfolio, usePortfolioHistory } from "../lib/queries";
import { cn } from "../lib/utils";

type Tab = "all" | InstrumentKind;

/** Format a decimal string for display without float noise. */
function dec(s: string | null, max = 4): string {
  if (s == null) return "—";
  const n = Number(s);
  return n.toLocaleString("en-IN", { maximumFractionDigits: max });
}

export default function Investments() {
  const { data, error, isLoading } = usePortfolio();
  const history = usePortfolioHistory();
  const [tab, setTab] = useState<Tab>("all");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Holding | null>(null);
  const invalidate = useInvalidateAll();
  const refresh = useMutation({
    mutationFn: () => api.post<{ updated: number; not_found: string[]; nav_date: string | null }>("/investments/prices/refresh"),
    onSuccess: invalidate,
  });

  const holdings = useMemo(() => {
    const list = (data?.holdings ?? []).filter((h) => !h.instrument.archived && (tab === "all" || h.instrument.kind === tab));
    return list.sort((a, b) => (b.value ?? b.invested) - (a.value ?? a.invested));
  }, [data, tab]);
  const archivedHoldings = useMemo(() => {
    return (data?.holdings ?? []).filter((h) => h.instrument.archived && (tab === "all" || h.instrument.kind === tab));
  }, [data, tab]);
  const totals = tab === "all" ? data?.totals : data?.by_kind[tab];
  const current = holdings.filter((h) => Number(h.units) > 0);
  const closed = holdings.filter((h) => Number(h.units) === 0);

  const restore = useMutation({
    mutationFn: (inst: Instrument) => api.put(`/investments/instruments/${inst.id}`, { ...inst, archived: false }),
    onSuccess: invalidate,
  });

  // keep the detail dialog in sync after edits
  useEffect(() => {
    if (selected && data) setSelected(data.holdings.find((h) => h.instrument.id === selected.instrument.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      <PageHeader
        title="Investments"
        subtitle="Mutual funds use AMFI NAVs · stock prices are entered by you"
        actions={
          <>
            <Button onClick={() => refresh.mutate()} disabled={refresh.isPending} title="Download the latest NAVs from AMFI">
              {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh NAVs
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add holding
            </Button>
          </>
        }
      />
      <ErrorNote error={error ?? refresh.error} />
      {refresh.data && (
        <p className="rounded-md border border-line bg-card px-3 py-2 text-xs text-muted">
          Updated {refresh.data.updated} fund{refresh.data.updated === 1 ? "" : "s"}
          {refresh.data.nav_date && <> · NAV date {shortDate(refresh.data.nav_date)}</>}
          {refresh.data.not_found.length > 0 && <span className="text-warn"> · not found: {refresh.data.not_found.join(", ")}</span>}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Current value">{totals ? <Amount value={totals.value} /> : "—"}</Kpi>
        <Kpi label="Invested">{totals ? <Amount value={totals.invested} /> : "—"}</Kpi>
        <Kpi label="Unrealised P&L" caption={totals && pct(totals.unrealized_pct, 1, true)}>
          {totals ? <Amount value={totals.unrealized} kind="gain" /> : "—"}
        </Kpi>
        <Kpi label="XIRR" caption={totals && <>Day <Amount value={totals.day_change} kind="gain" /></>}>
          <span className={cn("font-mono tabular-nums", (totals?.xirr ?? 0) < 0 ? "text-expense" : "")}>{pct(totals?.xirr)}</span>
        </Kpi>
      </div>

      {history.data && history.data.length >= 2 && (
        <Card>
          <CardHeader
            title="Portfolio value vs invested"
            right={<Legend items={[{ label: "Value", color: CHART.accent }, { label: "Invested", color: CHART.ref, dashed: true }]} />}
          />
          <PortfolioChart data={history.data} />
          <p className="mt-2 text-xs text-faint">All holdings together. The gap between the lines is your unrealised gain; invested is the cost of what you still hold.</p>
        </Card>
      )}

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All" },
              { value: "mutual_fund", label: "Mutual funds" },
              { value: "stock", label: "Stocks" },
            ]}
          />
          {totals && totals.realized !== 0 && (
            <span className="text-xs text-faint">
              Realised <Amount value={totals.realized} kind="gain" /> · Dividends <Amount value={totals.dividends} />
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : holdings.length === 0 ? (
          <Empty icon={<TrendingUp className="h-6 w-6" />} title="No holdings yet">
            Add a mutual fund (search AMFI by name) or a stock, then record your buys.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th className="px-4 py-2 font-medium">Holding</th>
                  <th className="py-2 text-right font-medium">Units</th>
                  <th className="py-2 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Invested</th>
                  <th className="py-2 text-right font-medium">Value</th>
                  <th className="py-2 text-right font-medium">P&L</th>
                  <th className="px-4 py-2 text-right font-medium">XIRR</th>
                </tr>
              </thead>
              <tbody>
                {[...current, ...closed].map((h) => (
                  <tr key={h.instrument.id} onClick={() => setSelected(h)} className={cn("cursor-pointer border-b border-line/60 last:border-0 hover:bg-hover", Number(h.units) === 0 && "opacity-60")}>
                    <td className="max-w-[300px] px-4 py-2.5">
                      <div className="truncate">{h.instrument.name}</div>
                      <div className="text-xs text-faint">
                        {h.instrument.kind === "stock" ? `${h.instrument.exchange ?? "NSE"}:${h.instrument.symbol}` : `AMFI ${h.instrument.symbol}`}
                        {h.instrument.sub_category && ` · ${h.instrument.sub_category}`}
                        {Number(h.units) === 0 && " · closed"}
                      </div>
                    </td>
                    <td className="maskable py-2.5 text-right font-mono tabular-nums text-muted">{dec(h.units, 3)}</td>
                    <td className="py-2.5 text-right">
                      <div className="font-mono tabular-nums">{h.price ? dec(h.price, 2) : <span className="text-warn">set price</span>}</div>
                      {h.price_date && <div className="text-[11px] text-faint">{shortDate(h.price_date)}</div>}
                    </td>
                    <td className="py-2.5 text-right"><Amount value={h.invested} className="text-muted" /></td>
                    <td className="py-2.5 text-right">{h.value != null ? <Amount value={h.value} /> : "—"}</td>
                    <td className="py-2.5 text-right">
                      {h.unrealized != null ? (
                        <>
                          <Amount value={h.unrealized} kind="gain" />
                          <div className={cn("font-mono text-[11px]", (h.unrealized_pct ?? 0) >= 0 ? "text-income/80" : "text-expense/80")}>{pct(h.unrealized_pct, 1, true)}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums", (h.xirr ?? 0) < 0 ? "text-expense" : "text-zinc-200")}>{pct(h.xirr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-faint">
        Cost basis is FIFO. XIRR is shown once a holding is at least 30 days old. Tip: click a holding to record a buy, vest (employer shares), sell, dividend or price.
      </p>

      {archivedHoldings.length > 0 && (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-xs font-medium text-faint">Archived Holdings</h2>
            <span className="text-xs text-faint">{archivedHoldings.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <tbody>
                {archivedHoldings.map((h) => (
                  <tr
                    key={h.instrument.id}
                    onClick={() => setSelected(h)}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-hover opacity-75 transition hover:opacity-100"
                  >
                    <td className="max-w-[300px] px-4 py-2.5">
                      <div className="truncate text-zinc-300">{h.instrument.name}</div>
                      <div className="text-xs text-faint">
                        {h.instrument.kind === "stock" ? `${h.instrument.exchange ?? "NSE"}:${h.instrument.symbol}` : `AMFI ${h.instrument.symbol}`}
                        {h.instrument.sub_category && ` · ${h.instrument.sub_category}`}
                        {Number(h.units) === 0 ? " · 0 units" : ` · ${dec(h.units, 3)} units`}
                      </div>
                    </td>
                    <td className="maskable py-2.5 text-right font-mono tabular-nums text-muted">{dec(h.units, 3)}</td>
                    <td className="py-2.5 text-right">
                      <div className="font-mono tabular-nums">{h.price ? dec(h.price, 2) : "—"}</div>
                      {h.price_date && <div className="text-[11px] text-faint">{shortDate(h.price_date)}</div>}
                    </td>
                    <td className="py-2.5 text-right"><Amount value={h.invested} className="text-muted" /></td>
                    <td className="py-2.5 text-right">{h.value != null ? <Amount value={h.value} /> : "—"}</td>
                    <td className="py-2.5 text-right">
                      {h.unrealized != null ? (
                        <>
                          <Amount value={h.unrealized} kind="gain" />
                          <div className={cn("font-mono text-[11px]", (h.unrealized_pct ?? 0) >= 0 ? "text-income/80" : "text-expense/80")}>
                            {pct(h.unrealized_pct, 1, true)}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => restore.mutate(h.instrument)}
                        disabled={restore.isPending}
                        title="Restore holding to active portfolio"
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AddInstrument open={adding} onClose={() => setAdding(false)} />
      <HoldingDialog holding={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Kpi({ label, children, caption }: { label: string; children: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <Card className="transition hover:border-zinc-700 hover:bg-hover">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold">{children}</div>
      <div className="mt-1 min-h-4 font-mono text-xs text-faint">{caption}</div>
    </Card>
  );
}

// ------------------------------------------------------------ add instrument

function AddInstrument({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [kind, setKind] = useState<InstrumentKind>("mutual_fund");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<AmfiScheme | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState("NSE");
  const [sub, setSub] = useState("");

  useEffect(() => {
    if (open) {
      setQ(""); setDebounced(""); setPicked(null); setName(""); setSymbol(""); setSub(""); setExchange("NSE");
    }
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ["amfi", debounced],
    queryFn: () => api.get<AmfiScheme[]>("/investments/amfi/search", { q: debounced }),
    enabled: open && kind === "mutual_fund" && debounced.length >= 3 && !picked,
    staleTime: 6 * 3600_000,
  });

  const save = useMutation({
    mutationFn: (body: object) => api.post<Instrument>("/investments/instruments", body),
    onSuccess: async (inst) => {
      // Record today's NAV right away so the holding has a price.
      if (picked?.nav && picked.nav_date) {
        await api.post("/investments/prices", { instrument_id: inst.id, date: picked.nav_date, price: picked.nav }).catch(() => {});
      }
      invalidate();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (kind === "mutual_fund") {
      if (!picked) return;
      save.mutate({ kind, name: picked.name, symbol: picked.code, isin: picked.isin, sub_category: sub || null });
    } else {
      save.mutate({ kind, name, symbol: symbol.toUpperCase(), exchange, sub_category: sub || null });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add holding"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="inst-form" disabled={save.isPending || (kind === "mutual_fund" ? !picked : !name.trim() || !symbol.trim())}>
            Add
          </Button>
        </>
      }
    >
      <form id="inst-form" onSubmit={submit} className="space-y-4">
        <Segmented value={kind} onChange={(k) => { setKind(k); setPicked(null); }} options={[{ value: "mutual_fund", label: "Mutual fund" }, { value: "stock", label: "Stock" }]} />
        {kind === "mutual_fund" ? (
          picked ? (
            <div className="flex items-start justify-between gap-3 rounded-md border border-line p-3">
              <div>
                <div className="text-sm">{picked.name}</div>
                <div className="mt-0.5 text-xs text-faint">
                  Code {picked.code}{picked.isin && ` · ${picked.isin}`}
                  {picked.nav && ` · NAV ₹${dec(picked.nav)} on ${picked.nav_date && shortDate(picked.nav_date)}`}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>Change</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search AMFI, e.g. parag parikh flexi direct growth" className="pl-9" autoFocus />
              </div>
              <div className="scrollbar-thin max-h-72 overflow-y-auto rounded-md border border-line">
                {debounced.length < 3 ? (
                  <p className="p-3 text-xs text-faint">Type at least 3 characters. Include “direct growth” to narrow it down. First search downloads the AMFI list (a few seconds).</p>
                ) : search.isFetching ? (
                  <p className="flex items-center gap-2 p-3 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</p>
                ) : search.error ? (
                  <div className="p-3"><ErrorNote error={search.error} /></div>
                ) : search.data?.length ? (
                  search.data.map((s) => (
                    <button key={s.code} type="button" onClick={() => setPicked(s)} className="flex w-full items-center justify-between gap-3 border-b border-line/60 px-3 py-2 text-left text-sm last:border-0 hover:bg-hover">
                      <span className="min-w-0">
                        <span className="block truncate">{s.name}</span>
                        <span className="text-xs text-faint">{s.code}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted">{s.nav ? `₹${dec(s.nav)}` : "—"}</span>
                    </button>
                  ))
                ) : (
                  <p className="p-3 text-xs text-faint">No schemes match.</p>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company name" className="col-span-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Infosys" autoFocus />
            </Field>
            <Field label="Symbol">
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="INFY" className="font-mono uppercase" />
            </Field>
            <Field label="Exchange">
              <Select value={exchange} onChange={(e) => setExchange(e.target.value)}>
                <option>NSE</option>
                <option>BSE</option>
                <option>NASDAQ</option>
                <option>NYSE</option>
              </Select>
            </Field>
          </div>
        )}
        <Field label="Label (optional)" hint="e.g. Index, Flexi cap, IT, Banking — for grouping">
          <Input value={sub} onChange={(e) => setSub(e.target.value)} maxLength={60} />
        </Field>
        <ErrorNote error={save.error} />
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------ holding detail

function HoldingDialog({ holding, onClose }: { holding: Holding | null; onClose: () => void }) {
  const inst = holding?.instrument;
  const invalidate = useInvalidateAll();
  const { data: accounts = [] } = useAccounts();
  const txns = useQuery({
    queryKey: ["inv-txns", inst?.id],
    queryFn: () => api.get<InvTxn[]>(`/investments/instruments/${inst!.id}/txns`),
    enabled: !!inst,
  });
  const [editing, setEditing] = useState<InvTxn | "new" | null>(null);
  const [priceVal, setPriceVal] = useState("");
  const [priceDate, setPriceDate] = useState(todayISO());
  useEffect(() => {
    setEditing(null);
    setPriceVal("");
    setPriceDate(todayISO());
  }, [inst?.id]);

  const done = () => {
    invalidate();
    txns.refetch();
  };
  const setPrice = useMutation({
    mutationFn: () => api.post("/investments/prices", { instrument_id: inst!.id, date: priceDate, price: priceVal.replace(/,/g, "") }),
    onSuccess: () => { setPriceVal(""); done(); },
  });
  const archive = useMutation({
    mutationFn: () => api.put(`/investments/instruments/${inst!.id}`, { ...inst!, archived: true }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const unarchive = useMutation({
    mutationFn: () => api.put(`/investments/instruments/${inst!.id}`, { ...inst!, archived: false }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/investments/instruments/${inst!.id}?cascade=true`),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const avg = holding && Number(holding.units) > 0 ? holding.invested / 100 / Number(holding.units) : null;

  return (
    <Dialog open={!!holding} onClose={onClose} title={inst?.name ?? ""} wide>
      {holding && inst && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Units" value={<span className="maskable font-mono">{dec(holding.units, 4)}</span>} />
            <Stat label="Avg cost" value={<span className="maskable font-mono">{avg ? `₹${avg.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}</span>} />
            <Stat label="Value" value={holding.value != null ? <Amount value={holding.value} /> : "—"} />
            <Stat label="P&L" value={holding.unrealized != null ? <Amount value={holding.unrealized} kind="gain" /> : "—"} />
          </div>
          {(holding.realized !== 0 || holding.dividends !== 0) && (
            <p className="text-xs text-faint">
              Realised <Amount value={holding.realized} kind="gain" /> · Dividends <Amount value={holding.dividends} />
            </p>
          )}

          <div className="rounded-md border border-line p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Tag className="h-3.5 w-3.5" /> Price
              <span className="font-normal text-faint">
                {holding.price ? ` · ₹${dec(holding.price, 4)} on ${shortDate(holding.price_date!)} (${holding.price_source})` : " · none yet"}
              </span>
            </div>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (Number(priceVal.replace(/,/g, "")) > 0) setPrice.mutate(); }}>
              <Input value={priceVal} onChange={(e) => setPriceVal(e.target.value)} inputMode="decimal" placeholder={inst.kind === "stock" ? "Last traded price" : "NAV"} className="w-40 font-mono" />
              <DateField value={priceDate} onChange={setPriceDate} className="w-44" />
              <Button type="submit" disabled={setPrice.isPending}>Set price</Button>
            </form>
            <ErrorNote error={setPrice.error} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">History</span>
              <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" /> Record</Button>
            </div>
            {editing && <InvTxnForm inst={inst} txn={editing === "new" ? null : editing} onDone={() => { setEditing(null); done(); }} onCancel={() => setEditing(null)} />}
            <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-md border border-line">
              {txns.data?.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {txns.data.map((t) => (
                      <tr key={t.id} onClick={() => setEditing(t)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-hover">
                        <td className="px-3 py-2 text-xs text-muted">{shortDate(t.date)} {t.date.slice(0, 4)}</td>
                        <td className="py-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium uppercase", t.type === "buy" ? "bg-teal-500/10 text-accent" : t.type === "vest" ? "bg-violet-500/10 text-violet-400" : t.type === "sell" ? "bg-amber-500/10 text-warn" : "bg-green-500/10 text-income")}>{t.type}</span>
                        </td>
                        <td className="maskable py-2 text-right font-mono text-xs text-muted">{t.units ? `${dec(t.units, 4)} @ ${dec(t.price, 2)}` : ""}</td>
                        <td className="py-2 text-right"><Amount value={t.amount} exact={t.amount % 100 !== 0} /></td>
                        <td className="hidden px-3 py-2 text-right text-xs text-faint sm:table-cell">{t.account_id ? accName.get(t.account_id) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-3 text-xs text-faint">{txns.isLoading ? "Loading…" : "No transactions yet — record your first buy."}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3">
            <div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  const msg = txns.data?.length
                    ? `Permanently delete "${inst.name}" along with all its ${txns.data.length} recorded transaction(s)? This cannot be undone.`
                    : `Permanently delete "${inst.name}"?`;
                  if (confirm(msg)) remove.mutate();
                }}
                disabled={remove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete holding
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <ErrorNote error={archive.error ?? unarchive.error ?? remove.error} />
              {inst.archived ? (
                <Button size="sm" variant="secondary" onClick={() => unarchive.mutate()} disabled={unarchive.isPending}>
                  <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm("Archive this holding? It will be hidden from your active list, but transaction history is preserved.") && archive.mutate()}
                  disabled={archive.isPending}
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line p-2.5">
      <div className="text-xs text-faint">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

const US_EXCHANGES = ["NASDAQ", "NYSE"];
const FX_KEY = "aureon.usdInr"; // last USD→INR rate used, pre-filled next time

function InvTxnForm({ inst, txn, onDone, onCancel }: { inst: Instrument; txn: InvTxn | null; onDone: () => void; onCancel: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const [type, setType] = useState<InvTxn["type"]>(txn?.type ?? "buy");
  const [date, setDate] = useState(txn?.date ?? todayISO());
  const [units, setUnits] = useState(txn?.units ?? "");
  const [price, setPrice] = useState(txn?.price ?? "");
  const [amount, setAmount] = useState(txn ? rupeesInput(txn.amount) : "");
  const [amountTouched, setAmountTouched] = useState(!!txn);
  const [accountId, setAccountId] = useState(txn ? String(txn.account_id ?? "") : String(accounts.find((a) => a.type === "bank" && !a.archived)?.id ?? ""));
  const [note, setNote] = useState(txn?.note ?? "");
  // USD helper for US-listed shares: price in USD × USD→INR rate gives the ₹ price.
  const usStock = inst.kind === "stock" && US_EXCHANGES.includes(inst.exchange ?? "");
  const [usd, setUsd] = useState(usStock && !txn);
  const [usdPrice, setUsdPrice] = useState("");
  const [fx, setFx] = useState(() => localStorage.getItem(FX_KEY) ?? "");
  const hasUnits = type !== "dividend";

  useEffect(() => {
    if (!usd) return;
    const p = Number(usdPrice), r = Number(fx);
    setPrice(p > 0 && r > 0 ? String(Math.round(p * r * 10000) / 10000) : "");
  }, [usd, usdPrice, fx]);

  // Suggest amount = units × price until the user edits it (charges, stamp duty…)
  useEffect(() => {
    if (amountTouched || !hasUnits) return;
    const u = Number(units), p = Number(price);
    if (u > 0 && p > 0) setAmount((Math.round(u * p * 100) / 100).toFixed(2));
  }, [units, price, hasUnits, amountTouched]);

  const save = useMutation({
    mutationFn: (body: object) => (txn ? api.put(`/investments/txns/${txn.id}`, body) : api.post("/investments/txns", body)),
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => api.del(`/investments/txns/${txn!.id}`), onSuccess: onDone });

  function submit(e: FormEvent) {
    e.preventDefault();
    const paise = toPaise(amount);
    if (!paise) return;
    // Keep the USD figures with the entry, so the ₹ value can be traced later.
    const usdNote = usd && hasUnits && usdPrice && fx ? `$${usdPrice} × ₹${fx}` : "";
    if (usd && fx) localStorage.setItem(FX_KEY, fx);
    save.mutate({
      instrument_id: inst.id,
      account_id: type === "vest" || !accountId ? null : Number(accountId),
      date,
      type,
      units: hasUnits ? units.trim() : null,
      price: !hasUnits || !price.trim() ? null : price.trim(),
      amount: paise,
      note: [note.trim(), usdNote].filter(Boolean).join(" · ") || null,
    });
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-3 rounded-md border border-zinc-700 bg-bg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "buy", label: "Buy" },
            ...(inst.kind === "stock" || type === "vest" ? [{ value: "vest" as const, label: "Vest" }] : []),
            { value: "sell", label: "Sell" },
            { value: "dividend", label: "Dividend" },
          ]}
        />
        {inst.kind === "stock" && hasUnits && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={usd} onChange={(e) => setUsd(e.target.checked)} className="accent-[var(--color-accent)]" />
            Price in USD
          </label>
        )}
      </div>
      {type === "vest" && (
        <p className="text-xs text-faint">
          Shares from your employer (RSU / ESPP). Enter the <span className="text-muted">net shares received</span> and their market value on the vest date.
          No account is charged, and it isn't counted as "Invested" on Overview.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={type === "vest" ? "Vest date" : "Date"}><DateField value={date} onChange={setDate} /></Field>
        {hasUnits && (
          <>
            <Field label={type === "vest" ? "Net shares" : "Units"}><Input value={units} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" className="font-mono" required /></Field>
            {usd ? (
              <>
                <Field label="Price (USD)"><Input value={usdPrice} onChange={(e) => setUsdPrice(e.target.value)} inputMode="decimal" className="font-mono" placeholder="172.50" required /></Field>
                <Field label="USD → INR" hint="SBI TT buying rate"><Input value={fx} onChange={(e) => setFx(e.target.value)} inputMode="decimal" className="font-mono" placeholder="84.10" required /></Field>
              </>
            ) : (
              <Field label={inst.kind === "mutual_fund" ? "NAV" : "Price (₹)"}><Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="font-mono" /></Field>
            )}
          </>
        )}
        <Field label={type === "buy" ? "Total paid (₹)" : type === "vest" ? "Value on vest date (₹)" : "Received (₹)"}>
          <Input value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} inputMode="decimal" className="font-mono" required />
        </Field>
        {type !== "vest" && (
          <Field label={type === "buy" ? "Paid from" : "Credited to"} className="col-span-2">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Not tracked</option>
              {accounts.filter((a) => !a.archived || String(a.id) === accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Note" className="col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "vest" ? "e.g. RSU grant 2024, release #3" : undefined} /></Field>
      </div>
      {hasUnits && units && price && Number(units) > 0 && (
        <p className="text-xs text-faint">
          {units} × {usd ? <>${usdPrice} × ₹{fx} = ₹{price}/share → </> : <>₹{price} = </>}
          <span className="font-mono">{money(Math.round(Number(units) * Number(price) * 100), { exact: true })}</span>
          {type === "buy" ? ". Adjust the total for charges." : type === "sell" ? ". Adjust for fees and tax withheld." : "."}
        </p>
      )}
      <ErrorNote error={save.error ?? del.error} />
      <div className="flex justify-end gap-2">
        {txn && (
          <Button size="sm" variant="danger" className="mr-auto" onClick={() => confirm("Delete this entry?") && del.mutate()}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" disabled={save.isPending}>{txn ? "Save" : "Record"}</Button>
      </div>
    </form>
  );
}
