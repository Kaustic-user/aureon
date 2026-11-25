// Typed client for the local Aureon API. All amounts are integer paise;
// units and prices are decimal strings.

export type TxnKind = "expense" | "income" | "transfer";
export type AccountType = "bank" | "credit_card" | "cash" | "wallet" | "investment" | "loan" | "other";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: number;
  archived: boolean;
  balance: number;
}

export interface Category {
  id: number;
  name: string;
  kind: "expense" | "income";
  parent_id: number | null;
  color: string;
  archived: boolean;
}

export interface Split {
  friend_id: number;
  amount: number;
}

/**
 * With a friend (friend_id) one side is the friend instead of an account:
 * expense/income with no account = the friend paid your share / let go of what you owed;
 * transfer from account_id = you paid them; transfer to to_account_id = they paid you.
 */
export interface Txn {
  id: number;
  date: string;
  kind: TxnKind;
  /** Full amount that moved. */
  amount: number;
  /** Your part: amount minus friends' shares. */
  own_amount: number;
  account_id: number | null;
  to_account_id: number | null;
  friend_id: number | null;
  category_id: number | null;
  merchant: string | null;
  note: string | null;
  source: string;
  splits: Split[];
}

export type TxnIn = Omit<Txn, "id" | "source" | "own_amount" | "friend_id" | "splits"> & {
  friend_id?: number | null;
  splits?: Split[];
};

export interface Friend {
  id: number;
  name: string;
  opening_balance: number;
  archived: boolean;
  /** Positive: they owe you. Negative: you owe them. */
  balance: number;
  last_activity: string | null;
}

/** How a transaction moves what `friendId` owes you (positive = they owe you more). */
export function friendEffect(t: Txn, friendId: number): number {
  if (t.friend_id === friendId) {
    if (t.kind === "expense") return -t.amount;
    if (t.kind === "income") return t.amount;
    return t.account_id != null ? t.amount : -t.amount;
  }
  return t.splits.find((s) => s.friend_id === friendId)?.amount ?? 0;
}

export interface TxnPage {
  items: Txn[];
  total: number;
  sum_income: number;
  sum_expense: number;
}

export interface BudgetRow {
  category_id: number;
  name: string;
  color: string;
  budget: number | null;
  spent: number;
}

export interface BudgetMonth {
  month: string;
  rows: BudgetRow[];
  total_budget: number;
  total_spent_budgeted: number;
  total_spent: number;
  projected_spent: number | null;
}

export interface UpcomingItem {
  rule_id: number;
  name: string;
  kind: TxnKind;
  amount: number;
  date: string;
  overdue: boolean;
}

export interface Recurring {
  id: number;
  name: string;
  kind: TxnKind;
  amount: number;
  account_id: number;
  category_id: number | null;
  frequency: "weekly" | "monthly" | "yearly";
  next_date: string;
  active: boolean;
}

export type InstrumentKind = "mutual_fund" | "stock";

export interface Instrument {
  id: number;
  kind: InstrumentKind;
  name: string;
  symbol: string;
  isin: string | null;
  exchange: string | null;
  sub_category: string | null;
  archived: boolean;
}

export interface InvTxn {
  id: number;
  instrument_id: number;
  account_id: number | null;
  date: string;
  type: "buy" | "sell" | "dividend" | "vest";
  units: string | null;
  price: string | null;
  amount: number;
  note: string | null;
}

export interface Holding {
  instrument: Instrument;
  units: string;
  invested: number;
  value: number | null;
  price: string | null;
  price_date: string | null;
  price_source: string | null;
  unrealized: number | null;
  unrealized_pct: number | null;
  realized: number;
  dividends: number;
  day_change: number | null;
  xirr: number | null;
}

export interface PortfolioTotals {
  invested: number;
  value: number;
  unrealized: number;
  unrealized_pct: number | null;
  realized: number;
  dividends: number;
  day_change: number;
  xirr: number | null;
  missing_prices: number;
}

export interface Portfolio {
  holdings: Holding[];
  totals: PortfolioTotals;
  by_kind: Partial<Record<InstrumentKind, PortfolioTotals>>;
}

export interface AmfiScheme {
  code: string;
  isin: string | null;
  name: string;
  nav: string | null;
  nav_date: string | null;
}

export interface Dashboard {
  month: string;
  as_of: string;
  net_worth: { value: number; change_3m: number; change_3m_pct: number | null };
  income: { total: number; split: { name: string; amount: number }[] };
  spent: { total: number; previous: number; change_pct: number | null };
  savings: { amount: number; rate: number | null };
  invested: number;
  net_worth_trend: { month: string; date: string; value: number }[];
  cash_flow: { month: string; income: number; spent: number; partial: boolean }[];
  /** Cumulative spend per day of month; `current` is null for days not reached yet. */
  daily_spend: { day: number; current: number | null; previous: number | null }[];
  spend_by_category: { category_id: number | null; name: string; color: string; amount: number }[];
  top_transactions: {
    id: number;
    date: string;
    kind: TxnKind;
    amount: number;
    merchant: string | null;
    note: string | null;
    category: string | null;
  }[];
  budgets: BudgetMonth;
  upcoming: UpcomingItem[];
  portfolio: { totals: PortfolioTotals; by_kind: Partial<Record<InstrumentKind, PortfolioTotals>> };
}

/** Portfolio market value vs cost basis on one date. */
export interface PortfolioPoint {
  date: string;
  value: number;
  invested: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length) {
      return d
        .map((e: { loc?: unknown[]; msg?: string }) => {
          const field = e.loc?.filter((x) => x !== "body").join(".");
          return field ? `${field}: ${e.msg}` : e.msg;
        })
        .join("; ");
    }
  }
  return fallback;
}

type Params = Record<string, string | number | boolean | null | undefined>;

async function request<T>(method: string, path: string, opts: { params?: Params; body?: unknown } = {}): Promise<T> {
  const url = new URL("/api" + path, window.location.origin);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, `${res.status} ${res.statusText}`));
  return body as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, { params }),
  post: <T>(path: string, body?: unknown, params?: Params) => request<T>("POST", path, { body, params }),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, { body }),
  del: (path: string) => request<void>("DELETE", path),
};
