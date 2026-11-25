import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeftRight, HandCoins, Pencil, Plus, Receipt, Split, Trash2, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { txnToDraft, type TxnDraft } from "../components/TxnDialog";
import { Amount, Button, Card, CardHeader, Dialog, Empty, ErrorNote, Field, Input, PageHeader, Segmented, Skeleton } from "../components/ui";
import { useActions } from "../lib/actions";
import { api, friendEffect, type Friend, type TxnPage } from "../lib/api";
import { money, rupeesInput, shortDate, toPaise } from "../lib/format";
import { categoryIndex, useAccounts, useCategories, useFriends, useInvalidateAll } from "../lib/queries";
import { cn } from "../lib/utils";

/** "owes you ₹400", "you owe ₹150", "settled up" */
function balanceText(b: number) {
  if (b > 0) return { label: "owes you", tone: "text-income" };
  if (b < 0) return { label: "you owe", tone: "text-expense" };
  return { label: "settled up", tone: "text-faint" };
}

export default function Friends() {
  const { data: friends, error, isLoading } = useFriends();
  const { data: accounts = [] } = useAccounts();
  const { openTxn } = useActions();
  const invalidate = useInvalidateAll();
  const [editing, setEditing] = useState<Friend | "new" | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const archiveToggle = useMutation({
    mutationFn: (f: Friend) => api.put<Friend>(`/friends/${f.id}`, { name: f.name, opening_balance: f.opening_balance, archived: !f.archived }),
    onSuccess: invalidate,
  });

  const live = (friends ?? []).filter((f) => !f.archived);
  const archived = (friends ?? []).filter((f) => f.archived);
  const owedToMe = live.filter((f) => f.balance > 0).reduce((s, f) => s + f.balance, 0);
  const iOwe = live.filter((f) => f.balance < 0).reduce((s, f) => s - f.balance, 0);
  const selected = (friends ?? []).find((f) => f.id === selectedId) ?? live[0] ?? null;
  const defaultAccount = accounts.find((a) => !a.archived)?.id;

  // Prefilled drafts; the transaction dialog lets you adjust before saving.
  const actions = {
    settle: (f: Friend): TxnDraft =>
      f.balance >= 0
        ? { kind: "transfer", friend_id: f.id, account_id: null, to_account_id: defaultAccount ?? null, amount: f.balance || undefined }
        : { kind: "transfer", friend_id: f.id, account_id: defaultAccount ?? null, to_account_id: null, amount: -f.balance },
    split: (f: Friend): TxnDraft => ({ kind: "expense", splits: [{ friend_id: f.id, amount: 0 }] }),
    theyPaid: (f: Friend): TxnDraft => ({ kind: "expense", friend_id: f.id, account_id: null }),
    writeOff: (f: Friend): TxnDraft =>
      f.balance > 0
        ? { kind: "expense", friend_id: f.id, account_id: null, amount: f.balance, note: "Written off" }
        : { kind: "income", friend_id: f.id, account_id: null, amount: -f.balance, note: "Forgiven" },
  };

  return (
    <>
      <PageHeader
        title="Friends"
        subtitle="Shared bills and who owes whom. Only your share counts as spending."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add friend
          </Button>
        }
      />
      <ErrorNote error={error ?? archiveToggle.error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-muted">Owed to you</div>
          <Amount value={owedToMe} className="mt-2 block text-2xl font-bold text-income" />
        </Card>
        <Card>
          <div className="text-sm text-muted">You owe</div>
          <Amount value={iOwe} className={cn("mt-2 block text-2xl font-bold", iOwe > 0 && "text-expense")} />
        </Card>
        <Card>
          <div className="text-sm text-muted">Net</div>
          <Amount value={owedToMe - iOwe} kind="gain" className="mt-2 block text-2xl font-bold" />
        </Card>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : live.length === 0 ? (
        <Card>
          <Empty icon={<Users className="h-6 w-6" />} title="No friends yet">
            Add the people you share bills with. Then split an expense when you add it, or record when a friend pays for you.
          </Empty>
          <SplitwiseTip />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className="p-0">
            <ul className="divide-y divide-line/60">
              {live.map((f) => {
                const b = balanceText(f.balance);
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => setSelectedId(f.id)}
                      className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-hover", selected?.id === f.id && "bg-hover")}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-xs font-semibold uppercase text-muted">
                        {f.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{f.name}</span>
                        <span className="block text-xs text-faint">{f.last_activity ? `Last activity ${shortDate(f.last_activity)}` : "No activity yet"}</span>
                      </span>
                      <span className="text-right">
                        <span className={cn("block text-[11px]", b.tone)}>{b.label}</span>
                        {f.balance !== 0 && <Amount value={Math.abs(f.balance)} exact={f.balance % 100 !== 0} className={cn("text-sm", b.tone)} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {selected && (
            <FriendPanel
              key={selected.id}
              friend={selected}
              onEdit={() => setEditing(selected)}
              onArchive={() => archiveToggle.mutate(selected)}
              onAction={(a) => openTxn(actions[a](selected))}
              openTxn={openTxn}
            />
          )}
        </div>
      )}

      {live.length > 0 && (
        <Card>
          <SplitwiseTip />
        </Card>
      )}

      {archived.length > 0 && (
        <Card>
          <CardHeader title="Archived" />
          <div className="divide-y divide-line/60">
            {archived.map((f) => (
              <div key={f.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted">{f.name}</span>
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => archiveToggle.mutate(f)}>
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <FriendDialog friend={editing} onClose={() => setEditing(null)} />
    </>
  );
}

type Action = "settle" | "split" | "theyPaid" | "writeOff";

function FriendPanel({
  friend,
  onEdit,
  onArchive,
  onAction,
  openTxn,
}: {
  friend: Friend;
  onEdit: () => void;
  onArchive: () => void;
  onAction: (a: Action) => void;
  openTxn: (d?: TxnDraft) => void;
}) {
  const { data: cats = [] } = useCategories();
  const idx = categoryIndex(cats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions", "friend", friend.id],
    queryFn: () => api.get<TxnPage>("/transactions", { friend_id: friend.id, limit: 1000 }),
  });
  const b = balanceText(friend.balance);
  const items = data?.items ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{friend.name}</h2>
          <p className={cn("text-sm", b.tone)}>
            {b.label} {friend.balance !== 0 && <Amount value={Math.abs(friend.balance)} exact />}
          </p>
        </div>
        <div className="flex">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label="Edit friend" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onArchive} aria-label="Archive friend" title="Archive (needs a settled balance)">
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={friend.balance !== 0 ? "primary" : "secondary"} onClick={() => onAction("settle")}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> Settle up
        </Button>
        <Button size="sm" onClick={() => onAction("split")}>
          <Split className="h-3.5 w-3.5" /> Split a bill
        </Button>
        <Button size="sm" onClick={() => onAction("theyPaid")}>
          <Receipt className="h-3.5 w-3.5" /> They paid for me
        </Button>
        {friend.balance !== 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAction("writeOff")}
            title={friend.balance > 0 ? "They won't pay it back: count it as your spending" : "They told you to forget it: count it as income"}
          >
            <HandCoins className="h-3.5 w-3.5" /> {friend.balance > 0 ? "Write off" : "They let it go"}
          </Button>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-2 flex items-center justify-between text-xs text-faint">
          <span>History</span>
          {friend.opening_balance !== 0 && (
            <span>
              Starting balance <Amount value={friend.opening_balance} kind="gain" exact />
            </span>
          )}
        </div>
        <ErrorNote error={error} />
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-faint">Nothing shared with {friend.name} yet.</p>
        ) : (
          <ul className="-mx-4">
            {items.map((t) => {
              const effect = friendEffect(t, friend.id);
              const what =
                t.kind === "transfer"
                  ? t.account_id != null
                    ? "You paid them"
                    : "They paid you"
                  : t.friend_id === friend.id
                    ? t.kind === "expense"
                      ? "They paid for you"
                      : "They let it go"
                    : `You paid ${money(t.amount, { exact: t.amount % 100 !== 0 })}, split`;
              return (
                <li key={t.id}>
                  <button onClick={() => openTxn(txnToDraft(t))} className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-hover">
                    <span className="w-14 shrink-0 text-xs text-faint">{shortDate(t.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.merchant ?? t.note ?? idx.label(t.category_id) ?? (t.kind === "transfer" ? "Settle up" : "Untitled")}</span>
                      <span className="block truncate text-xs text-faint">{what}</span>
                    </span>
                    <Amount value={effect} kind="gain" exact={effect % 100 !== 0} className="text-sm" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {items.length > 0 && <p className="mt-2 text-[11px] text-faint">+ means {friend.name} owes you more, − means less (or you owe them).</p>}
      </div>
    </Card>
  );
}

function SplitwiseTip() {
  return (
    <div className="space-y-1 text-xs leading-relaxed text-muted">
      <p className="font-medium text-zinc-200">Using Splitwise too?</p>
      <p>
        Add each friend with their current Splitwise balance as the starting balance, then record new bills here as you go. When Splitwise
        simplifies debts (Asha pays you on Ben's behalf), record it as <em>Asha paid you</em> and <em>you paid Ben</em> with the same account;
        your bank balance nets out and both friends' balances are right.
      </p>
    </div>
  );
}

function FriendDialog({ friend, onClose }: { friend: Friend | "new" | null; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const f = friend && friend !== "new" ? friend : null;
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [theyOwe, setTheyOwe] = useState(true);
  const [key, setKey] = useState<unknown>(null);
  if (friend !== key) {
    setKey(friend);
    setName(f?.name ?? "");
    setOpening(f && f.opening_balance ? rupeesInput(Math.abs(f.opening_balance)) : "");
    setTheyOwe(f ? f.opening_balance >= 0 : true);
  }
  const done = () => {
    invalidate();
    onClose();
  };
  const save = useMutation({
    mutationFn: (body: object) => (f ? api.put(`/friends/${f.id}`, body) : api.post("/friends", body)),
    onSuccess: done,
  });
  const del = useMutation({ mutationFn: () => api.del(`/friends/${f!.id}`), onSuccess: done });
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = opening.trim() === "" ? 0 : toPaise(opening);
    if (p == null) return setLocalError("Enter the starting balance in rupees, or leave it empty.");
    setLocalError(null);
    save.mutate({ name: name.trim(), opening_balance: theyOwe ? p : -p, archived: f?.archived ?? false });
  }

  return (
    <Dialog
      open={friend !== null}
      onClose={onClose}
      title={f ? "Edit friend" : "Add friend"}
      footer={
        <>
          {f && (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={del.isPending}
              onClick={() => confirm(`Delete ${f.name}? Only possible if they have no transactions; otherwise archive them.`) && del.mutate()}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="friend-form" disabled={save.isPending || !name.trim()}>
            {f ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form id="friend-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asha" maxLength={60} autoFocus />
        </Field>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted">Starting balance</span>
          <Segmented
            className="flex w-full [&>button]:flex-1"
            value={theyOwe ? "they" : "me"}
            onChange={(v) => setTheyOwe(v === "they")}
            options={[
              { value: "they", label: "They owe me" },
              { value: "me", label: "I owe them" },
            ]}
          />
        </div>
        <Field label="Amount (₹)" hint="What was already owed before you started tracking here, e.g. your Splitwise balance. Leave empty if settled.">
          <Input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="0" className="font-mono tabular-nums" />
        </Field>
        <ErrorNote error={localError ?? save.error ?? del.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
