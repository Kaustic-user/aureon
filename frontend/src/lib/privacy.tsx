import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "aureon.privacy";
const Ctx = createContext<{ masked: boolean; toggle: () => void }>({ masked: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [masked, setMasked] = useState(() => localStorage.getItem(KEY) === "1");
  useEffect(() => {
    document.documentElement.classList.toggle("privacy-masked", masked);
    localStorage.setItem(KEY, masked ? "1" : "0");
  }, [masked]);
  return <Ctx.Provider value={{ masked, toggle: () => setMasked((m) => !m) }}>{children}</Ctx.Provider>;
}

export const usePrivacy = () => useContext(Ctx);
