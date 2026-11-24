import { useMutation } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Banknote, CreditCard, Landmark, LineChart, Pencil, Plus, Repeat, Smartphone, Trash2, Wallet } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { DateField } from "../components/Calendar";
import { CategorySelect } from "../components/CategorySelect";
import { Amount, Button, Card, CardHeader, Dialog, Empty, ErrorNote, Field, Input, PageHeader, Segmented, Select, Skeleton } from "../components/ui";
import { api, type Account, type AccountType, type Recurring } from "../lib/api";
import { money, rupeesInput, shortDate, todayISO, toPaise } from "../lib/format";
import { useAccounts, useCategories, useInvalidateAll, useRecurring } from "../lib/queries";
import { cn } from "../lib/utils";

const TYPES: { value: AccountType; label: string; icon: ReactNode }[] = [
  { value: "bank", label: "Bank account", icon: <Landmark className="h-4 w-4" /> },
  { value: "credit_card", label: "Credit card", icon: <CreditCard className="h-4 w-4" /> },
  { value: "cash", label: "Cash", icon: <Banknote className="h-4 w-4" /> },
  { value: "wallet", label: "Wallet / UPI", icon: <Smartphone className="h-4 w-4" /> },
  { value: "investment", label: "Investment cash", icon: <LineChart className="h-4 w-4" /> },
  { value: "loan", label: "Loan", icon: <Wallet className="h-4 w-4" /> },
  { value: "other", label: "Other", icon: <Wallet className="h-4 w-4" /> },
];
const typeInfo = (t: string) => TYPES.find((x) => x.value === t) ?? TYPES[TYPES.length - 1];

export default function Accounts() {
  const { data: accounts, error, isLoading } = useAccounts();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const invalidate = useInvalidateAll();
  const update = useMutation({
    mutationFn: (a: Account) => api.put<Account>(`/accounts/${a.id}`, { name: a.name, type: a.type, opening_balance: a.opening_balance, archived: !a.archived }),
    onSuccess: invalidate,
  });

  const live = (accounts ?? []).filter((a) => !a.archived);
  const archived = (accounts ?? []).filter((a) => a.archived);
  const assets = live.filter((a) => a.balance >= 0).reduce((s, a) => s + a.balance, 0);
  const liabilities = live.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Balances are calculated from your opening balance and every transaction since"
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add account
          </Button>
        }
      />
      <ErrorNote error={error ?? update.error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-muted">Cash & bank</div>
          <Amount value={assets} className="mt-2 block text-2xl font-bold" />
        </Card>
        <Card>
          <div className="text-sm text-muted">Owed (cards, loans)</div>
          <Amount value={liabilities} className={cn("mt-2 block text-2xl font-bold", liabilities < 0 && "text-expense")} />
        </Card>
        <Card>
          <div className="text-sm text-muted">Net (excl. investments)</div>
          <Amount value={assets + liabilities} className="mt-2 block text-2xl font-bold" />
        </Card>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : live.length === 0 ? (
        <Card>
          <Empty icon={<Wallet className="h-6 w-6" />} title="No accounts yet">
            Add your bank account, cards, cash and wallets with today’s balance as the opening balance.
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((a) => (
            <AccountCard key={a.id} a={a} onEdit={() => setEditing(a)} onArchive={() => update.mutate(a)} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <Card>
          <CardHeader title="Archived" />
          <div className="divide-y divide-line/60">
            {archived.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted">{a.name}</span>
                <span className="flex items-center gap-3">
                  <Amount value={a.balance} className="text-muted" />
                  <Button size="sm" variant="ghost" onClick={() => update.mutate(a)}>
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <RecurringBlock />
      <AccountDialog account={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function AccountCard({ a, onEdit, onArchive }: { a: Account; onEdit: () => void; onArchive: () => void }) {
  const t = typeInfo(a.type);
  return (
    <Card className="group transition hover:border-zinc-700 hover:bg-hover">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-line text-muted">{t.icon}</span>
          <div>
            <div className="text-sm font-medium">{a.name}</div>
            <div className="text-xs text-faint">{t.label}</div>
          </div>
        </div>
        <div className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onArchive} aria-label="Archive" title="Archive (hide, keep history)">
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Amount value={a.balance} className={cn("mt-4 block text-2xl font-bold", a.balance < 0 && "text-expense")} />
      <div className="mt-1 text-xs text-faint">
        Opening <span className="maskable font-mono">{money(a.opening_balance)}</span>
      </div>
    </Card>
  );
}

function AccountDialog({ account, onClose }: { account: Account | "new" | null; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const isNew = account === "new";
  const a = account && account !== "new" ? account : null;
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [opening, setOpening] = useState("");
  const [negative, setNegative] = useState(false);
  const [key, setKey] = useState<unknown>(null);
  if (account !== key) {
    setKey(account);
    setName(a?.name ?? "");
    setType((a?.type as AccountType) ?? "bank");
    setOpening(a ? rupeesInput(Math.abs(a.opening_balance)) : "");
    setNegative(a ? a.opening_balance < 0 : false);
  }
  const save = useMutation({
    mutationFn: (body: object) => (a ? api.put(`/accounts/${a.id}`, body) : api.post("/accounts", body)),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api.del(`/accounts/${a!.id}`),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const debtLike = type === "credit_card" || type === "loan";

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = opening.trim() === "" ? 0 : toPaise(opening);
    if (p == null) return;
    save.mutate({ name, type, opening_balance: negative || (debtLike && isNew && p > 0) ? -p : p, archived: a?.archived ?? false });
  }

  return (
    <Dialog
      open={account !== null}
      onClose={onClose}
      title={isNew ? "Add account" : "Edit account"}
      footer={
        <>
          {a && (
            <Button variant="danger" className="mr-auto" onClick={() => confirm(`Delete ${a.name}? Only possible if it has no transactions.`) && del.mutate()}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="acc-form" disabled={save.isPending || !name.trim()}>
            {isNew ? "Add" : "Save"}
          </Button>
        </>
      }
    >
      <form id="acc-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" maxLength={80} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field
          label={debtLike ? "Amount owed at start (₹)" : "Opening balance (₹)"}
          hint={debtLike && isNew ? "Entered as money owed — the balance will show as negative." : "The balance before the first transaction you record here."}
        >
          <div className="flex gap-2">
            <Input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="0" className="font-mono tabular-nums" />
            {!isNew && (
              <Segmented value={negative ? "neg" : "pos"} onChange={(v) => setNegative(v === "neg")} options={[{ value: "pos", label: "+" }, { value: "neg", label: "−" }]} />
            )}
          </div>
        </Field>
        <ErrorNote error={save.error ?? del.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

// ----------------------------------------------------------- recurring

function RecurringBlock() {
  const { data: rules = [] } = useRecurring();
  const { data: accounts = [] } = useAccounts();
  const invalidate = useInvalidateAll();
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "post" | "skip" }) => api.post(`/recurring/${id}/${action}`),
    onSuccess: invalidate,
  });
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const today = todayISO();

  return (
    <Card>
      <CardHeader
        title="Recurring"
        right={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> Add rule
          </Button>
        }
      />
      <ErrorNote error={act.error} />
      {rules.length === 0 ? (
        <Empty icon={<Repeat className="h-6 w-6" />} title="No recurring items">Rent, SIPs, subscriptions and salary — log them in one click when due.</Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-4 pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Next</th>
                <th className="hidden pb-2 font-medium sm:table-cell">Account</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="px-4 pb-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={cn("border-b border-line/60 last:border-0 hover:bg-hover", !r.active && "opacity-50")}>
                  <td className="px-4 py-2">
                    <button className="text-left hover:underline" onClick={() => setEditing(r)}>{r.name}</button>
                    <div className="text-xs capitalize text-faint">{r.frequency}</div>
                  </td>
                  <td className={cn("py-2 text-xs", r.next_date <= today ? "text-warn" : "text-muted")}>{shortDate(r.next_date)}</td>
                  <td className="hidden py-2 text-xs text-muted sm:table-cell">{accName.get(r.account_id)}</td>
                  <td className="py-2 text-right">
                    <Amount value={r.amount} kind={r.kind === "income" ? "income" : undefined} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.active && (
                      <span className="inline-flex gap-1">
                        <Button size="sm" onClick={() => act.mutate({ id: r.id, action: "post" })} disabled={act.isPending} title="Record it as a transaction now">
                          Log
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, action: "skip" })} disabled={act.isPending}>
                          Skip
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RecurringDialog rule={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function RecurringDialog({ rule, onClose }: { rule: Recurring | "new" | null; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const invalidate = useInvalidateAll();
  const r = rule && rule !== "new" ? rule : null;
  const [form, setForm] = useState({ name: "", kind: "expense" as "expense" | "income", amount: "", account_id: "", category_id: "", frequency: "monthly", next_date: todayISO(), active: true });
  const [key, setKey] = useState<unknown>(null);
  if (rule !== key) {
    setKey(rule);
    setForm({
      name: r?.name ?? "",
      kind: r?.kind === "income" ? "income" : "expense",
      amount: r ? rupeesInput(r.amount) : "",
      account_id: String(r?.account_id ?? accounts.find((a) => !a.archived)?.id ?? ""),
      category_id: r?.category_id ? String(r.category_id) : "",
      frequency: r?.frequency ?? "monthly",
      next_date: r?.next_date ?? todayISO(),
      active: r?.active ?? true,
    });
  }
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: (body: object) => (r ? api.put(`/recurring/${r.id}`, body) : api.post("/recurring", body)),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api.del(`/recurring/${r!.id}`),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = toPaise(form.amount);
    if (!amount) return;
    save.mutate({
      name: form.name,
      kind: form.kind,
      amount,
      account_id: Number(form.account_id),
      category_id: form.category_id ? Number(form.category_id) : null,
      frequency: form.frequency,
      next_date: form.next_date,
      active: form.active,
    });
  }

  return (
    <Dialog
      open={rule !== null}
      onClose={onClose}
      title={r ? "Edit recurring" : "Add recurring"}
      footer={
        <>
          {r && (
            <Button variant="danger" className="mr-auto" onClick={() => confirm(`Delete “${r.name}”? Past transactions stay.`) && del.mutate()}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rec-form" disabled={save.isPending}>Save</Button>
        </>
      }
    >
      <form id="rec-form" onSubmit={submit} className="space-y-4">
        <Segmented value={form.kind} onChange={(v) => setForm((f) => ({ ...f, kind: v, category_id: "" }))} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rent" required />
          </Field>
          <Field label="Amount (₹)">
            <Input value={form.amount} onChange={(e) => set("amount", e.target.value)} inputMode="decimal" className="font-mono" required />
          </Field>
          <Field label="Account">
            <Select value={form.account_id} onChange={(e) => set("account_id", e.target.value)}>
              {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Category">
            <CategorySelect
              value={form.category_id}
              onChange={(id) => set("category_id", id)}
              cats={cats}
              kind={form.kind}
              placeholder="Uncategorised"
            />
          </Field>
          <Field label="Repeats">
            <Select value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>
          <Field label="Next date">
            <DateField value={form.next_date} onChange={(d) => set("next_date", d)} align="right" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="accent-teal-400" /> Active
        </label>
        <ErrorNote error={save.error ?? del.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
