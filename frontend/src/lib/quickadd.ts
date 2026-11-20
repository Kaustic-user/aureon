import type { Account, Category } from "./api";
import { isoDate, todayISO, toPaise } from "./format";

export interface QuickParse {
  amount: number | null;
  kind: "expense" | "income";
  merchant: string | null;
  categoryId: number | null;
  accountId: number | null;
  date: string;
}

// Words that hint at a category when the merchant name alone doesn't.
const HINTS: Record<string, string> = {
  chai: "Coffee & snacks", coffee: "Coffee & snacks", tea: "Coffee & snacks", snacks: "Coffee & snacks",
  lunch: "Eating out", dinner: "Eating out", breakfast: "Eating out", swiggy: "Eating out", zomato: "Eating out",
  groceries: "Groceries", grocery: "Groceries", bigbasket: "Groceries", blinkit: "Groceries", zepto: "Groceries", dmart: "Groceries",
  uber: "Local travel", ola: "Local travel", rapido: "Local travel", auto: "Local travel", metro: "Local travel", cab: "Local travel",
  petrol: "Fuel", fuel: "Fuel", flight: "Flights & trains", train: "Flights & trains", irctc: "Flights & trains", hotel: "Hotels",
  rent: "Rent", electricity: "Utilities", movie: "Entertainment", netflix: "Subscriptions", spotify: "Subscriptions",
  amazon: "Shopping", myntra: "Shopping", medicine: "Health", pharmacy: "Health", doctor: "Health",
  salary: "Salary", interest: "Interest", refund: "Refunds", freelance: "Freelance",
};

/**
 * Parse free text like "240 chai at Blue Tokai", "salary 80000",
 * "1.2k uber yesterday", "450 lunch from card".
 */
export function parseQuick(text: string, accounts: Account[], cats: Category[]): QuickParse {
  let rest = ` ${text.trim()} `;
  let date = todayISO();
  if (/\byesterday\b/i.test(rest)) {
    date = isoDate(new Date(Date.now() - 86400000));
    rest = rest.replace(/\byesterday\b/i, " ");
  } else if (/\btoday\b/i.test(rest)) {
    rest = rest.replace(/\btoday\b/i, " ");
  }

  let amount: number | null = null;
  const m = rest.match(/(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d{1,2})?)(k)?\b/i);
  if (m) {
    const base = toPaise(m[1]);
    if (base != null) amount = m[2] ? base * 1000 : base;
    rest = rest.replace(m[0], " ");
  }

  // "from <account>" / "via <account>" / "on <account>"
  let accountId: number | null = null;
  const active = accounts.filter((a) => !a.archived);
  const accM = rest.match(/\b(?:from|via|using|with)\s+(\w[\w\s]*?)\s*$/i);
  if (accM) {
    const needle = accM[1].toLowerCase();
    const acc = active.find((a) => a.name.toLowerCase().includes(needle) || a.type.replace("_", " ").includes(needle));
    if (acc) {
      accountId = acc.id;
      rest = rest.replace(accM[0], " ");
    }
  }

  let merchant: string | null = null;
  const atM = rest.match(/\b(?:at|@|to)\s+(.+?)\s*$/i);
  if (atM) {
    merchant = atM[1].trim();
    rest = rest.replace(atM[0], " ");
  }
  const words = rest.trim().split(/\s+/).filter(Boolean);
  const haystack = [...words, ...(merchant ? merchant.split(/\s+/) : [])].map((w) => w.toLowerCase());

  // Category: exact category name first, then keyword hints.
  const live = cats.filter((c) => !c.archived);
  let cat: Category | undefined = live.find((c) => haystack.includes(c.name.toLowerCase()));
  if (!cat) {
    for (const w of haystack) {
      const hint = HINTS[w.replace(/[^a-z]/g, "")];
      if (hint && (cat = live.find((c) => c.name === hint))) break;
    }
  }
  if (!merchant && words.length) {
    merchant = words.join(" ");
    merchant = merchant.charAt(0).toUpperCase() + merchant.slice(1);
  }

  return {
    amount,
    kind: cat?.kind === "income" ? "income" : "expense",
    merchant: merchant || null,
    categoryId: cat?.id ?? null,
    accountId,
    date,
  };
}
