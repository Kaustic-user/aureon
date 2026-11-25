import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { Empty } from "./components/ui";
import "@fontsource-variable/inter";
import "./index.css";
import { ActionsProvider } from "./lib/actions";
import { PrivacyProvider } from "./lib/privacy";
import { ThemeProvider } from "./lib/theme";

// Each page is its own chunk, so the first load only fetches the page you open.
const Overview = lazy(() => import("./pages/Overview"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Budgets = lazy(() => import("./pages/Budgets"));
const Accounts = lazy(() => import("./pages/Accounts"));
const Friends = lazy(() => import("./pages/Friends"));
const Investments = lazy(() => import("./pages/Investments"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <PrivacyProvider>
        <BrowserRouter>
          <ActionsProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="budgets" element={<Budgets />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="friends" element={<Friends />} />
                <Route path="investments" element={<Investments />} />
                <Route path="*" element={<Empty title="Page not found" />} />
              </Route>
            </Routes>
          </ActionsProvider>
        </BrowserRouter>
      </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
