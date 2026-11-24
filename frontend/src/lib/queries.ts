import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Account, type Category, type Dashboard, type Instrument, type Portfolio, type PortfolioPoint, type Recurring, type Txn, type TxnIn, type UpcomingItem } from "./api";

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts") });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
export const useDashboard = (month: string) =>
  useQuery({ queryKey: ["dashboard", month], queryFn: () => api.get<Dashboard>("/dashboard", { month }), placeholderData: (p) => p });
export const usePortfolio = (includeArchived: boolean = true) =>
  useQuery({ queryKey: ["portfolio", includeArchived], queryFn: () => api.get<Portfolio>("/investments/portfolio", { include_archived: includeArchived }) });
export const usePortfolioHistory = () =>
  useQuery({ queryKey: ["portfolio-history"], queryFn: () => api.get<PortfolioPoint[]>("/investments/history") });
export const useInstruments = () => useQuery({ queryKey: ["instruments"], queryFn: () => api.get<Instrument[]>("/investments/instruments") });
export const useRecurring = () => useQuery({ queryKey: ["recurring"], queryFn: () => api.get<Recurring[]>("/recurring") });
export const useUpcoming = () => useQuery({ queryKey: ["upcoming"], queryFn: () => api.get<UpcomingItem[]>("/upcoming") });

/** After any write, everything derived (balances, dashboard, budgets) may change. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useSaveTxn() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: TxnIn }) =>
      id ? api.put<Txn>(`/transactions/${id}`, body) : api.post<Txn>("/transactions", body),
    onSuccess: invalidate,
  });
}

export function useDeleteTxn() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: number) => api.del(`/transactions/${id}`), onSuccess: invalidate });
}

/** Map of id -> category, plus a display label "Parent · Child". */
export function categoryIndex(cats: Category[] | undefined) {
  const byId = new Map<number, Category>();
  for (const c of cats ?? []) byId.set(c.id, c);
  const label = (id: number | null | undefined) => {
    if (id == null) return null;
    const c = byId.get(id);
    if (!c) return null;
    return c.name;
  };
  const top = (id: number | null | undefined) => {
    let c = id == null ? undefined : byId.get(id);
    while (c?.parent_id != null) c = byId.get(c.parent_id);
    return c;
  };
  return { byId, label, top };
}
