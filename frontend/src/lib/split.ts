// Split arithmetic, in integer paise so shares always add up exactly.
import type { Split } from "./api";
import { rupeesInput, toPaise } from "./format";

export type SplitMode = "equal" | "custom";

/**
 * Equal shares of `total` among `ids` (and you, if `includeMe`).
 * Leftover paise go to you; if you're not part of it, to the first friend.
 */
export function equalSplits(total: number, ids: number[], includeMe: boolean): Split[] {
  const people = ids.length + (includeMe ? 1 : 0);
  if (!ids.length || !people || total <= 0) return [];
  const each = Math.floor(total / people);
  const out = ids.map((friend_id) => ({ friend_id, amount: each }));
  if (!includeMe) out[0].amount += total - each * ids.length;
  return out;
}

const same = (a: Split[], b: Split[]) => a.length === b.length && a.every((s, i) => s.friend_id === b[i].friend_id && s.amount === b[i].amount);

/** Recover the editor state from saved splits (so an equal split reopens as "equal"). */
export function splitStateFrom(total: number, splits: Split[]) {
  const ids = splits.map((s) => s.friend_id);
  const custom = Object.fromEntries(splits.map((s) => [s.friend_id, rupeesInput(s.amount)]));
  for (const includeMe of [true, false]) {
    if (same(equalSplits(total, ids, includeMe), splits)) return { ids, mode: "equal" as SplitMode, includeMe, custom };
  }
  return { ids, mode: "custom" as SplitMode, includeMe: true, custom };
}

/** The splits to save, or an error message to show. */
export function buildSplits(
  total: number,
  ids: number[],
  mode: SplitMode,
  includeMe: boolean,
  custom: Record<number, string>,
  nameOf: (id: number) => string,
): { splits: Split[]; error: string | null } {
  if (!ids.length) return { splits: [], error: "Pick at least one friend to split with, or turn splitting off." };
  let splits: Split[];
  if (mode === "equal") {
    splits = equalSplits(total, ids, includeMe);
  } else {
    splits = [];
    for (const id of ids) {
      const p = toPaise(custom[id] ?? "");
      if (p == null) return { splits: [], error: `Enter ${nameOf(id)}'s share in rupees.` };
      splits.push({ friend_id: id, amount: p });
    }
  }
  const zero = splits.find((s) => s.amount <= 0);
  if (zero) return { splits: [], error: `${nameOf(zero.friend_id)}'s share must be more than ₹0. Remove them if they're not part of it.` };
  const shared = splits.reduce((s, x) => s + x.amount, 0);
  if (shared > total) return { splits: [], error: "Friends' shares add up to more than the total." };
  return { splits, error: null };
}
