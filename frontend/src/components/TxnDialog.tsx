import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Category, Txn, TxnIn, TxnKind } from "../lib/api";
import { rupeesInput, todayISO, toPaise } from "../lib/format";
import { useAccounts, useCategories, useDeleteTxn, useSaveTxn } from "../lib/queries";
import { DateField } from "./Calendar";
import { CategorySelect } from "./CategorySelect";
import { Button, Dialog, ErrorNote, Field, Input, Segmented, Select } from "./ui";

export type TxnDraft = Partial<TxnIn> & { id?: number };

/** Category <select> grouped as "Food" then indented children. */
export function CategoryOptions({ cats, kind }: { cats: Category[]; kind: "expense" | "income" }) {
  const tops = cats.filter((c) => c.kind === kind && c.parent_id == null && !c.archived);
  return (
    <>
      {tops.map((t) => {
        const kids = cats.filter((c) => c.parent_id === t.id && !c.archived);
        return kids.length ? (
          <optgroup key={t.id} label={t.name}>
            <option value={t.id}>{t.name} (general)</option>
            {kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        );
      })}
    </>
  );
}

export function TxnDialog({ open, draft, onClose }: { open: boolean; draft: TxnDraft | null; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const save = useSaveTxn();
  const del = useDeleteTxn();
  const liveAccounts = useMemo(() => accounts.filter((a) => !a.archived || a.id === draft?.account_id), [accounts, draft]);

  const [kind, setKind] = useState<TxnKind>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = draft ?? {};
    setKind(d.kind ?? "expense");
    setAmount(d.amount ? rupeesInput(d.amount) : "");
    setDate(d.date ?? todayISO());
    setAccountId(String(d.account_id ?? liveAccounts[0]?.id ?? ""));
    setToAccountId(d.to_account_id ? String(d.to_account_id) : "");
    setCategoryId(d.category_id ? String(d.category_id) : "");
    setMerchant(d.merchant ?? "");
    setNote(d.note ?? "");
    setLocalError(null);
    save.reset();
    del.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  // Default account once accounts load
  useEffect(() => {
    if (open && !accountId && liveAccounts[0]) setAccountId(String(liveAccounts[0].id));
  }, [open, accountId, liveAccounts]);

  function changeKind(k: TxnKind) {
    setKind(k);
    const c = cats.find((x) => String(x.id) === categoryId);
    if (k === "transfer" || (c && c.kind !== k)) setCategoryId("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const paise = toPaise(amount);
    if (!paise) return setLocalError("Enter an amount greater than zero.");
    if (!accountId) return setLocalError("Add an account first (Accounts page).");
    if (kind === "transfer" && !toAccountId) return setLocalError("Pick the account the money goes to.");
    setLocalError(null);
    const body: TxnIn = {
      date,
      kind,
      amount: paise,
      account_id: Number(accountId),
      to_account_id: kind === "transfer" ? Number(toAccountId) : null,
      category_id: kind !== "transfer" && categoryId ? Number(categoryId) : null,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
    };
    save.mutate({ id: draft?.id, body }, { onSuccess: onClose });
  }

  const editing = Boolean(draft?.id);
  const title = editing ? "Edit transaction" : kind === "income" ? "Add income" : kind === "transfer" ? "Add transfer" : "Add expense";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {editing && (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={del.isPending}
              onClick={() => {
                if (confirm("Delete this transaction? This is recorded in the audit log.")) del.mutate(draft!.id!, { onSuccess: onClose });
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="txn-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form id="txn-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={kind}
          onChange={changeKind}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <Input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono text-base tabular-nums"
              autoFocus
            />
          </Field>
          <Field label="Date">
            <DateField value={date} onChange={setDate} align="right" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "transfer" ? "From account" : "Account"}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {liveAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "transfer" ? (
            <Field label="To account">
              <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Select…</option>
                {liveAccounts
                  .filter((a) => String(a.id) !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : (
            <Field label="Category">
              <CategorySelect value={categoryId} onChange={setCategoryId} cats={cats} kind={kind} placeholder="Uncategorised" />
            </Field>
          )}
        </div>
        <Field label={kind === "income" ? "From (payer)" : kind === "transfer" ? "Description" : "Merchant"}>
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={120} placeholder={kind === "expense" ? "e.g. Blue Tokai" : ""} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional" />
        </Field>
        <ErrorNote error={localError ?? save.error ?? del.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function txnToDraft(t: Txn): TxnDraft {
  const { source: _s, ...rest } = t;
  return rest;
}
