import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Txn, TxnIn, TxnKind } from "../lib/api";
import { money, rupeesInput, todayISO, toPaise } from "../lib/format";
import { useAccounts, useCategories, useDeleteTxn, useFriends, useSaveTxn } from "../lib/queries";
import { buildSplits, splitStateFrom, type SplitMode } from "../lib/split";
import { cn } from "../lib/utils";
import { DateField } from "./Calendar";
import { CategorySelect } from "./CategorySelect";
import { FriendChips, FriendSelect } from "./FriendPicker";
import { Button, Dialog, ErrorNote, Field, Input, Segmented, Select } from "./ui";

export type TxnDraft = Partial<TxnIn> & { id?: number };

type Direction = "out" | "in";

const Hint = ({ children }: { children: ReactNode }) => <p className="text-xs leading-relaxed text-faint">{children}</p>;

export function TxnDialog({ open, draft, onClose }: { open: boolean; draft: TxnDraft | null; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const { data: friends = [] } = useFriends();
  const save = useSaveTxn();
  const del = useDeleteTxn();
  const liveAccounts = useMemo(
    () => accounts.filter((a) => !a.archived || a.id === draft?.account_id || a.id === draft?.to_account_id),
    [accounts, draft],
  );
  // Archived friends only appear if this transaction already involves them.
  const liveFriends = useMemo(
    () => friends.filter((f) => !f.archived || f.id === draft?.friend_id || draft?.splits?.some((s) => s.friend_id === f.id)),
    [friends, draft],
  );
  const nameOf = (id: number | string) => friends.find((f) => String(f.id) === String(id))?.name ?? "Friend";

  const [kind, setKind] = useState<TxnKind>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  // Friend side: "paid by a friend" (expense), "friend let it go" (income), "with a friend" (transfer).
  const [withFriend, setWithFriend] = useState(false);
  const [friendId, setFriendId] = useState("");
  const [direction, setDirection] = useState<Direction>("out");
  // Splitting an expense you paid.
  const [splitOn, setSplitOn] = useState(false);
  const [splitIds, setSplitIds] = useState<number[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [includeMe, setIncludeMe] = useState(true);
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = draft ?? {};
    const k = d.kind ?? "expense";
    const fr = d.friend_id ?? null;
    setKind(k);
    setAmount(d.amount ? rupeesInput(d.amount) : "");
    setDate(d.date ?? todayISO());
    setAccountId(String(d.account_id ?? (fr != null ? d.to_account_id : null) ?? liveAccounts[0]?.id ?? ""));
    setToAccountId(fr == null && d.to_account_id ? String(d.to_account_id) : "");
    setCategoryId(d.category_id ? String(d.category_id) : "");
    setMerchant(d.merchant ?? "");
    setNote(d.note ?? "");
    setWithFriend(fr != null);
    setFriendId(fr != null ? String(fr) : "");
    setDirection(k === "transfer" && fr != null && d.account_id == null ? "in" : "out");
    // A draft may carry just the friends to split with (e.g. "Split a bill" from the Friends page).
    const s = !d.splits?.length
      ? null
      : d.amount
        ? splitStateFrom(d.amount, d.splits)
        : { ids: d.splits.map((x) => x.friend_id), mode: "equal" as SplitMode, includeMe: true, custom: {} };
    setSplitOn(Boolean(s));
    setSplitIds(s?.ids ?? []);
    setSplitMode(s?.mode ?? "equal");
    setIncludeMe(s?.includeMe ?? true);
    setCustom(s?.custom ?? {});
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
    if (k === "income") setWithFriend(false); // "friend let it go" is reached from the Friends page
  }

  const total = toPaise(amount) ?? 0;
  const splitting = kind === "expense" && !withFriend && splitOn;
  const preview = splitting && splitIds.length ? buildSplits(total, splitIds, splitMode, includeMe, custom, nameOf) : null;
  const friendsShare = preview?.splits.reduce((s, x) => s + x.amount, 0) ?? 0;
  const customShared = splitIds.reduce((s, id) => s + (toPaise(custom[id] ?? "") ?? 0), 0);

  function toggleSplitFriend(id: number) {
    setSplitIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const paise = toPaise(amount);
    if (!paise) return setLocalError("Enter an amount greater than zero.");
    if (withFriend && !friendId) return setLocalError("Pick the friend.");
    if (!accountId && !(withFriend && kind !== "transfer")) return setLocalError("Add an account first (Accounts page).");
    if (kind === "transfer" && !withFriend && !toAccountId) return setLocalError("Pick the account the money goes to.");
    if (kind === "transfer" && !withFriend && toAccountId === accountId) return setLocalError("Pick two different accounts.");

    let splits: TxnIn["splits"] = [];
    if (splitting) {
      const r = buildSplits(paise, splitIds, splitMode, includeMe, custom, nameOf);
      if (r.error) return setLocalError(r.error);
      splits = r.splits;
    }
    setLocalError(null);

    const fid = withFriend ? Number(friendId) : null;
    let account_id: number | null = Number(accountId);
    let to_account_id: number | null = null;
    if (kind === "transfer") {
      if (!withFriend) to_account_id = Number(toAccountId);
      else if (direction === "in") [account_id, to_account_id] = [null, Number(accountId)];
    } else if (withFriend) {
      account_id = null; // the friend paid, no account of yours moved
    }

    const body: TxnIn = {
      date,
      kind,
      amount: paise,
      account_id,
      to_account_id,
      friend_id: fid,
      splits,
      category_id: kind !== "transfer" && categoryId ? Number(categoryId) : null,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
    };
    save.mutate({ id: draft?.id, body }, { onSuccess: onClose });
  }

  const editing = Boolean(draft?.id);
  const title = editing
    ? "Edit transaction"
    : kind === "income"
      ? "Add income"
      : kind === "transfer"
        ? withFriend
          ? "Settle up"
          : "Add transfer"
        : "Add expense";
  const friendName = friendId ? nameOf(friendId) : "the friend";

  const accountSelect = (
    <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
      {liveAccounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );

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

        {kind === "expense" && (
          <Segmented
            value={withFriend ? "friend" : "me"}
            onChange={(v) => setWithFriend(v === "friend")}
            options={[
              { value: "me", label: "I paid" },
              { value: "friend", label: "A friend paid" },
            ]}
          />
        )}
        {kind === "transfer" && (
          <Segmented
            value={withFriend ? "friend" : "accounts"}
            onChange={(v) => setWithFriend(v === "friend")}
            options={[
              { value: "accounts", label: "Between my accounts" },
              { value: "friend", label: "With a friend" },
            ]}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "expense" && withFriend ? "Your share (₹)" : "Amount (₹)"}>
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

        {kind === "transfer" && withFriend ? (
          <>
            <Segmented
              value={direction}
              onChange={setDirection}
              options={[
                { value: "out", label: "I paid them" },
                { value: "in", label: "They paid me" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Friend">
                <FriendSelect value={friendId} onChange={setFriendId} friends={liveFriends} />
              </Field>
              <Field label={direction === "out" ? "From account" : "Into account"}>{accountSelect}</Field>
            </div>
            <Hint>
              {direction === "out"
                ? `You paid ${friendName} back or lent them money. Their balance goes up by this amount.`
                : `${friendName} paid you back. Their balance goes down by this amount.`}{" "}
              This is not counted as income or spending.
            </Hint>
          </>
        ) : kind === "transfer" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From account">{accountSelect}</Field>
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
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {withFriend ? (
                <Field label={kind === "income" ? "Friend who let it go" : "Paid by"}>
                  <FriendSelect value={friendId} onChange={setFriendId} friends={liveFriends} />
                </Field>
              ) : (
                <Field label="Account">{accountSelect}</Field>
              )}
              <Field label="Category">
                <CategorySelect value={categoryId} onChange={setCategoryId} cats={cats} kind={kind} placeholder="Uncategorised" />
              </Field>
            </div>
            {withFriend && (
              <Hint>
                {kind === "income"
                  ? `${friendName} let go of what you owed them. Counts as income and lowers what you owe.`
                  : `None of your accounts change. Your share counts as spending and is added to what you owe ${friendName}, or taken off what they owe you.`}
                {kind === "income" && (
                  <button type="button" className="ml-1 text-accent hover:underline" onClick={() => setWithFriend(false)}>
                    Use an account instead
                  </button>
                )}
              </Hint>
            )}
          </>
        )}

        {kind === "expense" && !withFriend && (
          <div className="space-y-3 rounded-md border border-line p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} className="accent-[var(--color-accent)]" />
              Split with friends
              {splitOn && total > 0 && preview && !preview.error && (
                <span className="ml-auto text-xs text-muted">
                  Your share <span className="maskable font-mono tabular-nums text-zinc-100">{money(total - friendsShare, { exact: true })}</span>
                </span>
              )}
            </label>
            {splitOn && (
              <>
                <FriendChips friends={liveFriends} picked={splitIds} onToggle={toggleSplitFriend} onCreated={(f) => setSplitIds((ids) => [...ids, f.id])} />
                {splitIds.length > 0 && (
                  <>
                    <div className="flex items-center gap-3">
                      <Segmented
                        value={splitMode}
                        onChange={(m) => {
                          // Seed custom amounts from the current equal split so switching is painless.
                          if (m === "custom" && preview && !preview.error)
                            setCustom((c) => ({ ...c, ...Object.fromEntries(preview.splits.map((s) => [s.friend_id, rupeesInput(s.amount)])) }));
                          setSplitMode(m);
                        }}
                        options={[
                          { value: "equal", label: "Equally" },
                          { value: "custom", label: "Custom amounts" },
                        ]}
                      />
                      {splitMode === "equal" && (
                        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-muted">
                          <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} className="accent-[var(--color-accent)]" />
                          Include me
                        </label>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {splitIds.map((id) => (
                        <div key={id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-zinc-200">{nameOf(id)} owes you</span>
                          {splitMode === "custom" ? (
                            <Input
                              inputMode="decimal"
                              placeholder="0"
                              value={custom[id] ?? ""}
                              onChange={(e) => setCustom((c) => ({ ...c, [id]: e.target.value }))}
                              className="h-8 w-28 text-right font-mono tabular-nums"
                              aria-label={`${nameOf(id)}'s share`}
                            />
                          ) : (
                            <span className="maskable font-mono tabular-nums text-zinc-100">
                              {money(preview?.splits.find((s) => s.friend_id === id)?.amount ?? 0, { exact: true })}
                            </span>
                          )}
                        </div>
                      ))}
                      {splitMode === "custom" && total > 0 && (
                        <p className={cn("text-right text-xs", customShared > total ? "text-expense" : "text-muted")}>
                          {customShared > total
                            ? `Over the total by ${money(customShared - total, { exact: true })}`
                            : `Left for you: ${money(total - customShared, { exact: true })}`}
                        </p>
                      )}
                    </div>
                    <Hint>The full amount leaves your account. Only your share counts as spending; the rest is added to what each friend owes you.</Hint>
                  </>
                )}
              </>
            )}
          </div>
        )}

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
  const { source: _s, own_amount: _o, ...rest } = t;
  return rest;
}
