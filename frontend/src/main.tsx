import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { Empty } from "./components/ui";
import "./index.css";
import { ActionsProvider } from "./lib/actions";
import { PrivacyProvider } from "./lib/privacy";
import Accounts from "./pages/Accounts";
import Budgets from "./pages/Budgets";
import Investments from "./pages/Investments";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrivacyProvider>
        <BrowserRouter>
          <ActionsProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="budgets" element={<Budgets />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="investments" element={<Investments />} />
                <Route path="*" element={<Empty title="Page not found" />} />
              </Route>
            </Routes>
          </ActionsProvider>
        </BrowserRouter>
      </PrivacyProvider>
    </QueryClientProvider>
  </StrictMode>,
);
