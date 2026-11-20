import { useSearchParams } from "react-router";
import { currentMonth } from "./format";

/** Month kept in the URL (?month=YYYY-MM) so views are linkable and survive reloads. */
export function useMonthParam(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("month");
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : currentMonth();
  const set = (m: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (m === currentMonth()) n.delete("month");
        else n.set("month", m);
        return n;
      },
      { replace: true },
    );
  return [month, set];
}
