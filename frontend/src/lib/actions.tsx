import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { QuickAdd } from "../components/QuickAdd";
import { TxnDialog, type TxnDraft } from "../components/TxnDialog";

interface Actions {
  openTxn: (draft?: TxnDraft) => void;
  openQuick: () => void;
}

const Ctx = createContext<Actions>({ openTxn: () => {}, openQuick: () => {} });

/** App-wide "add transaction" dialog and the Ctrl/⌘+K quick-add palette. */
export function ActionsProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<TxnDraft | null>(null);
  const [txnOpen, setTxnOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const openTxn = useCallback((d?: TxnDraft) => {
    setQuickOpen(false);
    setDraft(d ?? null);
    setTxnOpen(true);
  }, []);
  const openQuick = useCallback(() => setQuickOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ openTxn, openQuick }}>
      {children}
      <TxnDialog open={txnOpen} draft={draft} onClose={() => setTxnOpen(false)} />
      <QuickAdd open={quickOpen} onClose={() => setQuickOpen(false)} onExpand={openTxn} />
    </Ctx.Provider>
  );
}

export const useActions = () => useContext(Ctx);
