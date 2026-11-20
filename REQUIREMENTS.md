# Aureon: Personal Finance Manager, Requirements Document

**Name:** Aureon (renamed from "Expense Tracker", 2026-11-21)
**Owner:** Single user (initially), designed to be used for the rest of the owner's life
**Status:** Draft v0.1
**Last updated:** 2026-11-21

---

## 1. Vision

A personal finance system, not a basic expense log. It should give one trustworthy view of:

- **Where money comes from** (salary, freelance, interest, dividends, capital gains)
- **Where money goes** (daily spending, travel, bills, EMIs, subscriptions)
- **What money is doing** (mutual funds, stocks, FDs, gold, cash, and how each is performing)
- **Whether the owner is on track** (budgets, savings rate, net worth, goals)

The system must stay useful over decades: it should handle life changes (new job, marriage, a house, children, retirement) without a rewrite, and it must never lose historical data.

### Design principles

1. **Data is permanent.** Nothing is hard-deleted silently. Every change is traceable.
2. **Own your data.** Stored locally or in a store the owner controls; full export at any time in open formats (CSV, JSON).
3. **Low-effort entry, high-quality data.** Most transactions should be recorded in under 5 seconds, or imported automatically.
4. **Numbers must reconcile.** Totals on any screen must agree with the underlying records and with the bank/broker statements.
5. **Privacy first.** No financial data leaves the device or the chosen storage without explicit consent.

---

## 2. Target User and Core Use Cases

**Primary user:** One adult (22 years old at project start), salaried or early-career, with daily spending, a few mutual fund SIPs, and a small stock portfolio. Needs to build good habits early and keep records accurate for the long term.

### Core use cases

| # | Use case |
|---|---|
| UC-1 | Log an expense in seconds (coffee, auto, groceries) |
| UC-2 | See where this month's money went, by category, and compare with budget |
| UC-3 | Record income (salary, side income, interest, dividends) and see monthly savings |
| UC-4 | Track each mutual fund SIP and its current value, returns, and XIRR |
| UC-5 | Track each stock holding, its cost basis, current value, and P&L |
| UC-6 | See total net worth across all assets and liabilities, and how it changes over time |
| UC-7 | Get warnings before overspending or missing a SIP/EMI/bill |
| UC-8 | Prepare for tax season (categorized expenses, capital gains, investments under deduction sections) |
| UC-9 | Plan for a goal (bike, house, emergency fund, retirement) and see if on track |
| UC-10 | Export all data and move to another tool if needed |

---

## 3. Feature Requirements

Priority key: **P0** = must have for MVP, **P1** = needed for a strong v1, **P2** = later / nice to have.

### 3.1 Accounts and Wallets

| ID | Requirement | Priority |
|---|---|---|
| ACC-01 | Create accounts of types: bank account, credit card, cash wallet, UPI/wallet, investment account, loan, other | P0 |
| ACC-02 | Each account has an opening balance and a computed current balance | P0 |
| ACC-03 | Transfers between own accounts (e.g., bank to wallet, bank to brokerage) do not count as income or expense | P0 |
| ACC-04 | Credit cards: track outstanding balance, statement date, and due date | P1 |
| ACC-05 | Multi-currency accounts with a base currency for reporting (base default: INR, to be confirmed) | P2 |
| ACC-06 | Archive (not delete) closed accounts; they remain in history | P0 |

### 3.2 Transactions (Expenses and Income)

| ID | Requirement | Priority |
|---|---|---|
| TXN-01 | Add an expense with amount, date, category, account, note, and optional tags | P0 |
| TXN-02 | Add income with the same fields plus an income type (salary, freelance, interest, dividend, refund, gift, other) | P0 |
| TXN-03 | Quick-add: amount + category in one or two taps; date defaults to today; last-used category and account pre-selected | P0 |
| TXN-04 | Split a transaction across multiple categories (e.g., a ₹1,200 grocery bill with ₹900 groceries and ₹300 household) | P1 |
| TXN-05 | Attach a receipt photo or PDF to a transaction | P1 |
| TXN-06 | Recurring transactions (rent, subscriptions, SIP dates, salary) with auto-creation and a confirmation step | P0 |
| TXN-07 | Edit and delete transactions; every edit is logged (who/when/old value/new value) | P0 |
| TXN-08 | Mark a transaction as "reimbursable" or "shared" and track the amount owed back | P2 |
| TXN-09 | Search and filter by text, amount range, date range, category, tag, account, and payment method | P0 |
| TXN-10 | Duplicate detection when importing or when the same amount/date/merchant is entered twice | P1 |
| TXN-11 | Bulk edit (re-categorize many transactions at once) | P1 |

### 3.3 Categories, Tags, and Merchants

| ID | Requirement | Priority |
|---|---|---|
| CAT-01 | Predefined category tree, for example: Food (Groceries, Eating out, Coffee/Snacks), Travel (Local transport, Fuel, Flights, Hotels), Housing (Rent, Utilities, Maintenance), Bills & EMIs, Shopping, Health, Entertainment, Subscriptions, Education, Gifts & Donations, Personal care, Taxes, Investments | P0 |
| CAT-02 | Custom categories and sub-categories, with icons and colors | P0 |
| CAT-03 | Tags (free-form) in addition to categories, for cross-cutting views such as "Goa trip 2026" | P1 |
| CAT-04 | Merchant memory: the app learns that "Swiggy" → Food and suggests the category next time | P1 |
| CAT-05 | Mark categories as "needs" vs "wants" for budgeting analysis | P1 |
| CAT-06 | Trip / event mode: group expenses under a named event with its own total and date range | P1 |

### 3.4 Income Tracking

| ID | Requirement | Priority |
|---|---|---|
| INC-01 | Record salary with breakdown: gross, deductions (PF, tax, insurance), net in-hand | P1 |
| INC-02 | Track irregular income (freelance, bonuses, interest) separately from salary | P1 |
| INC-03 | Monthly income vs expense vs savings summary | P0 |
| INC-04 | Savings rate calculation (savings ÷ income) per month and as a rolling average | P1 |

### 3.5 Budgets and Limits

| ID | Requirement | Priority |
|---|---|---|
| BUD-01 | Monthly budget per category and an overall monthly budget | P0 |
| BUD-02 | Budget progress bars with spent / remaining / projected end-of-month | P0 |
| BUD-03 | Alerts at configurable thresholds (e.g., 80% and 100%) | P1 |
| BUD-04 | Rollover option for unused budget (on/off per category) | P2 |
| BUD-05 | Zero-based budgeting mode: every rupee of income is assigned a job | P2 |
| BUD-06 | Sinking funds: set aside monthly amounts for known future costs (annual insurance, birthdays, festivals) | P1 |

### 3.6 Investments: Mutual Funds

| ID | Requirement | Priority |
|---|---|---|
| MF-01 | Add mutual fund holdings: scheme name, AMC, folio number, category (equity/debt/hybrid/index), plan (direct/regular), growth/IDCW option | P0 |
| MF-02 | Record every purchase, SIP instalment, switch, redemption, and dividend with date, NAV, units, and amount | P0 |
| MF-03 | Import transactions from CAS (Consolidated Account Statement) PDF/Excel from CAMS / KFintech / MF Central | P1 |
| MF-04 | Fetch latest NAV automatically from a configurable data source (AMFI NAV file is a candidate) | P0 |
| MF-05 | Show current value, invested amount, absolute return, and XIRR per fund and in total | P0 |
| MF-06 | SIP tracker: planned SIP dates, amount, next due date, missed SIP detection, SIP-to-date total | P0 |
| MF-07 | Asset allocation view: equity / debt / gold / other, and by fund category | P1 |
| MF-08 | Overlap check: flag when multiple funds hold the same large stocks | P2 |
| MF-09 | Expense ratio tracking and "cost of expense ratio over time" estimate | P2 |
| MF-10 | Benchmark comparison: fund return vs its benchmark index and vs Nifty 50 / Sensex | P1 |
| MF-11 | Capital gains computation for tax (short-term vs long-term, grandfathering rules as applicable) | P1 |
| MF-12 | Goal linking: map each fund or SIP to a financial goal | P1 |

### 3.7 Investments: Stocks and ETFs

| ID | Requirement | Priority |
|---|---|---|
| STK-01 | Add holdings: symbol, exchange (NSE/BSE/US exchanges if needed), company name, sector | P0 |
| STK-02 | Record buys, sells, bonus, split, dividend, and rights issue events | P0 |
| STK-03 | Import contract notes or the broker's holdings/tradebook (CSV export from broker) | P1 |
| STK-04 | Current price from a market data source, with a clearly shown "last updated" time | P0 |
| STK-05 | Per-holding and portfolio P&L: unrealized, realized, day change, total return, XIRR | P0 |
| STK-06 | Cost basis using FIFO (default) and average cost | P0 |
| STK-07 | Dividend income tracking and yield on cost | P1 |
| STK-08 | Sector and market-cap allocation charts | P1 |
| STK-09 | Position sizing warning: a single stock above a configurable % of portfolio | P2 |
| STK-10 | Capital gains report (realized) for tax purposes | P1 |
| STK-11 | Watchlist with target price and alert when reached | P2 |

### 3.8 Other Assets and Liabilities

| ID | Requirement | Priority |
|---|---|---|
| AST-01 | Track fixed deposits, recurring deposits, PPF, EPF, NPS, bonds, gold (physical and digital), property, vehicles, crypto | P1 |
| AST-02 | Manual valuation with a date for assets without a live price feed (e.g., property estimate) | P1 |
| AST-03 | Liabilities: home loan, car loan, personal loan, credit card debt, with EMI, interest rate, and remaining tenure | P1 |
| AST-04 | Amortization schedule and "prepay vs invest" comparison | P2 |
| AST-05 | Insurance policies with premium due dates, sum assured, and nominee | P1 |

### 3.9 Net Worth and Portfolio Overview (Dashboard)

| ID | Requirement | Priority |
|---|---|---|
| DSH-01 | Home screen: this month's income, spend, savings, budget status, upcoming bills/SIPs | P0 |
| DSH-02 | Net worth = assets − liabilities, with trend chart over time (monthly snapshots) | P0 |
| DSH-03 | Portfolio overview: total invested, current value, overall return, XIRR, day change | P0 |
| DSH-04 | Cash flow chart: income vs expenses by month | P0 |
| DSH-05 | Spending breakdown donut/bar charts by category, by account, by tag | P0 |
| DSH-06 | Customizable widgets (reorder, hide) | P2 |

### 3.10 Reports and Analytics

| ID | Requirement | Priority |
|---|---|---|
| RPT-01 | Monthly report: income, spend, savings, top categories, largest transactions, change vs last month | P0 |
| RPT-02 | Yearly report (financial year and calendar year options) | P1 |
| RPT-03 | Custom date-range report with any filter combination | P1 |
| RPT-04 | Spending trends and anomaly detection ("you spent 2.3× your usual on Eating out this week") | P2 |
| RPT-05 | Tax summary: deductible investments (80C/80D style, configurable), tax-relevant expenses, capital gains | P1 |
| RPT-06 | Annual "money review" summary, shareable as PDF | P2 |
| RPT-07 | Goal progress report | P1 |

### 3.11 Goals and Planning

| ID | Requirement | Priority |
|---|---|---|
| GOL-01 | Create goals with target amount, target date, and linked accounts/investments | P1 |
| GOL-02 | Progress calculation: how much saved, how much still needed, required monthly saving | P1 |
| GOL-03 | Emergency fund target (e.g., 6 months of essential expenses), computed automatically | P1 |
| GOL-04 | Retirement and long-term projection: current corpus + SIP + expected return → projected value (assumptions editable) | P2 |
| GOL-05 | "What-if" simulator: change SIP amount, return rate, or inflation and see the effect | P2 |

### 3.12 Reminders and Notifications

| ID | Requirement | Priority |
|---|---|---|
| NTF-01 | Daily reminder to log expenses (configurable time, can be turned off) | P1 |
| NTF-02 | Bill and EMI due reminders (N days before) | P0 |
| NTF-03 | SIP execution reminders and "SIP failed / not reflected" alert | P1 |
| NTF-04 | Budget threshold alerts | P1 |
| NTF-05 | Stock price target and large day-move alerts | P2 |
| NTF-06 | Insurance premium and FD maturity reminders | P1 |

### 3.13 Data Input and Import

| ID | Requirement | Priority |
|---|---|---|
| IMP-01 | Manual entry (primary method, always available) | P0 |
| IMP-02 | CSV import with column mapping and a preview before commit | P0 |
| IMP-03 | Bank statement import (CSV / PDF) with automatic column detection | P1 |
| IMP-04 | Credit card statement import | P1 |
| IMP-05 | UPI / SMS parsing for transaction alerts (on Android, with user permission) | P2 |
| IMP-06 | Import is idempotent: importing the same file twice does not create duplicates | P0 |
| IMP-07 | Import history log: what was imported, when, and how many rows were accepted or rejected | P1 |
| IMP-08 | Undo the last import batch | P1 |

### 3.14 Data Export, Backup, and Portability

| ID | Requirement | Priority |
|---|---|---|
| EXP-01 | Export all data as CSV and JSON (full dump) | P0 |
| EXP-02 | Export reports as PDF and Excel | P1 |
| EXP-03 | Automatic encrypted local backups on a schedule (retention: keep last N) | P0 |
| EXP-04 | Restore from backup, with a dry-run preview | P0 |
| EXP-05 | Data schema is versioned with migrations, so old exports still open in future versions | P0 |

### 3.15 Security and Privacy

| ID | Requirement | Priority |
|---|---|---|
| SEC-01 | App lock: PIN, password, or biometric on launch and after inactivity | P0 |
| SEC-02 | Data encrypted at rest (AES-256 or equivalent; key derived from user secret, not hard-coded) | P0 |
| SEC-03 | Encrypted in transit for any network call (TLS only) | P0 |
| SEC-04 | No bank credentials stored by the app. Prefer file import or aggregator APIs with OAuth-style consent | P0 |
| SEC-05 | Audit log of edits to transactions, holdings, and settings | P1 |
| SEC-06 | Option to mask balances on the home screen (for shoulder-surfing) | P1 |
| SEC-07 | No third-party analytics or ad SDKs | P0 |
| SEC-08 | Clear data-deletion command that wipes local data and any cloud copy | P1 |

### 3.16 Platforms and User Experience

| ID | Requirement | Priority |
|---|---|---|
| UX-01 | Usable on a phone for daily entry (primary) and on a desktop for analysis and imports | P0 |
| UX-02 | Works offline; syncs when online | P1 |
| UX-03 | Multi-device sync with conflict handling (last-write-wins is not acceptable for transactions; use per-record versioning) | P1 |
| UX-04 | Dark mode and light mode | P1 |
| UX-05 | Accessible: readable font sizes, sufficient contrast, screen reader labels | P1 |
| UX-06 | Indian number formatting (lakhs/crores) and date formats, with a switch to international format | P0 |
| UX-07 | Onboarding wizard: add accounts, opening balances, categories, and first budget in under 10 minutes | P1 |
| UX-08 | Keyboard shortcuts on desktop for quick entry | P2 |
| UX-09 | Widgets for home screen quick-add | P2 |

### 3.17 Settings and Configuration

| ID | Requirement | Priority |
|---|---|---|
| SET-01 | Base currency, financial year start month, locale, date and number format | P0 |
| SET-02 | Default account and default category for quick-add | P0 |
| SET-03 | Market data source and refresh frequency (NAV: once daily after publishing; stocks: during market hours) | P1 |
| SET-04 | Cost basis method (FIFO / average) | P0 |
| SET-05 | Notification preferences per type | P1 |

---

## 4. Data Model (High Level)

Core entities. Full schema to be designed in the next phase.

- **Account**: id, name, type, currency, opening balance, status (active/archived)
- **Transaction**: id, date, amount, direction (in/out/transfer), account, category, tags, merchant, note, attachments, source (manual/import/recurring), version, created/updated timestamps
- **TransactionSplit**: transaction id, category, amount
- **Category**: id, parent id, name, icon, color, needs/wants flag
- **Budget**: category, month, amount, rollover flag
- **Holding** (MF or stock): instrument id, type, identifiers (ISIN / symbol / folio), quantity, cost basis
- **InvestmentTxn**: holding id, type (buy/sell/SIP/dividend/bonus/split/switch), date, units, price/NAV, charges, amount
- **PriceSnapshot**: instrument id, date/time, price or NAV, source
- **Asset / Liability**: name, type, valuation, valuation date, interest rate, tenure, EMI
- **Goal**: name, target amount, target date, linked accounts/holdings
- **Recurring rule**: template, frequency, next run date
- **AuditLog**: entity, field, old value, new value, timestamp, device
- **ImportBatch**: file name, source, rows total, accepted, rejected, timestamp

**Key rule:** Balances, net worth, and portfolio values are *derived* from transactions and snapshots, not typed in. Manual values are only allowed for assets without a feed, and they are dated.

---

## 5. Calculations and Definitions

| Metric | Definition |
|---|---|
| Savings | Income − Expenses (transfers and investments excluded from expenses; investments shown separately as "invested") |
| Savings rate | Savings ÷ Income |
| Net worth | Sum of assets (at current valuation) − sum of liabilities |
| Absolute return | (Current value − Invested) ÷ Invested |
| XIRR | Annualized return from dated cash flows (SIPs, lump sums, sells, current value as final cash flow) |
| Realized P&L | Sell proceeds − cost basis of units sold (FIFO or average, per setting) |
| Unrealized P&L | Current value − cost basis of units held |
| Emergency fund months | Liquid savings ÷ average monthly essential expenses (trailing 3 months) |

All calculations must be reproducible from stored data, and the app must show the formula or the source for any number on request.

---

## 6. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Quick-add completes in under 5 seconds from app open |
| NFR-02 | Dashboard loads in under 2 seconds with 10 years of data (about 50,000 transactions) |
| NFR-03 | Zero data loss: every confirmed write is durable before the UI reports success |
| NFR-04 | Money is stored as integers in minor units (paise) or decimal types; never floating point |
| NFR-05 | Timezone-safe dates; store in ISO format with the user's local timezone rule |
| NFR-06 | Unit tests for all calculations (XIRR, FIFO, budgets, net worth) with known reference values |
| NFR-07 | Migrations are tested: upgrading from every released schema version preserves data |
| NFR-08 | App works fully without internet except for price/NAV refresh |
| NFR-09 | Graceful degradation: if a price feed fails, show last known price with its timestamp, never zero |
| NFR-10 | Code and docs are versioned in git; each release is tagged |

---

## 7. Inspiration: Existing Products and What to Take From Them

| Product / type | What to take | What to avoid |
|---|---|---|
| **YNAB** (You Need A Budget) | Zero-based budgeting, every rupee has a job, goal-driven budgets | Steep learning curve for beginners; subscription cost |
| **Mint** (discontinued) | Auto-categorization, net worth tracking, bill reminders | Ad-driven design; dependence on a single vendor's lifespan |
| **Monarch Money** | Clean dashboards, goal tracking, shared finances | Cloud-only; limited offline use |
| **Splitwise** | Shared and split expenses, settle-up logic | Not designed for personal finance |
| **Walnut / Money Manager (Indian apps)** | Fast quick-add, SMS-based auto-entry, simple category UI | Weak investment tracking; data lock-in |
| **Kuvera / ET Money / Groww** | Mutual fund portfolio, XIRR, SIP tracking, CAS import | Upsell-heavy; limited expense tracking |
| **Zerodha Console / Tradebook** | Holdings and P&L for stocks, tradebook import | No expense or net worth view |
| **Actual Budget / Firefly III** | Open source, local-first data, self-hosting, full ownership | Setup effort; UI polish varies |
| **Personal Capital / Empower** | Net worth, investment fees analysis, retirement planner | US-centric; heavy on upselling |
| **Cashew / Financisto** | Offline-first, multi-currency, open data | Less polish on investments |

**Takeaways that shape this project**

1. Quick-add must be faster than any notebook. If entry is slow, the data goes stale.
2. Investments and expenses belong in one net worth view. Most apps split them.
3. Own the data. Open formats and local-first storage protect against vendor shutdowns.
4. Budgets should show *what is left and what is coming*, not only what was spent.
5. Reports should tie back to the source transactions, so the numbers can be trusted.

---

## 8. Phased Roadmap

### Phase 1: MVP (goal: daily use within 2 weeks)
- Accounts (ACC-01, 02, 03, 06)
- Transactions with quick-add, edit, delete, search (TXN-01, 02, 03, 07, 09)
- Categories (CAT-01, 02)
- Monthly dashboard and cash flow (DSH-01, 04, 05)
- Budgets per category (BUD-01, 02)
- Recurring transactions and bill reminders (TXN-06, NTF-02)
- Mutual fund holdings, SIP tracking, NAV refresh, returns (MF-01 to 06)
- Stock holdings, prices, P&L (STK-01 to 06)
- Net worth summary (DSH-02, DSH-03)
- CSV import and export, backups (IMP-02, IMP-06, EXP-01, 03, 04, 05)
- App lock and encryption (SEC-01 to 04, 07)
- Core settings (SET-01, 02, 04)

### Phase 2: Strong v1
- Split transactions, receipts, tags, merchant memory
- Salary breakdown, irregular income, savings rate
- Bank and card statement import, CAS import, broker import
- Assets and liabilities (FD, PPF, EPF, gold, loans, insurance)
- Capital gains and tax summary
- Goals, emergency fund, sinking funds, benchmark comparison
- Full reports (monthly, yearly, custom)
- Offline and multi-device sync
- Notifications for SIP, budget, insurance, FD

### Phase 3: Long-term and Advanced
- Retirement projection and what-if simulator
- Anomaly detection and spending insights
- Overlap analysis, expense ratio impact, position sizing
- Watchlist and price alerts
- SMS / UPI auto-capture
- Multi-currency
- Shared finances (family or partner) with permissions

---

## 9. Success Criteria

The project is successful when:

1. The owner logs at least 90% of daily expenses for 3 consecutive months without skipping.
2. Net worth on the app matches the sum of bank, broker, and fund statements within 1% at each month-end.
3. Every mutual fund and stock position matches the broker or AMC statement (units and value).
4. The owner can answer, within 1 minute: "How much did I spend on food last month?", "What is my portfolio's XIRR?", "Am I on track for my goal?"
5. Full data export and restore has been tested successfully at least once.
6. The owner uses the monthly review to make at least one decision per month (cut a category, change a SIP, rebalance).

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Data entry fatigue, app abandoned | Fast quick-add, import, daily reminder, minimal required fields |
| Price or NAV feed unavailable or changes | Pluggable data source, last-known-price fallback with timestamp |
| Incorrect tax or capital gains numbers | Clear assumptions, reference test cases, recommend a CA review before filing |
| Data loss from bugs or device loss | Encrypted backups, export, versioned schema, migration tests |
| Security of financial data | Encryption, app lock, no stored bank credentials, minimal permissions |
| Scope creep | Phased roadmap; each phase has a finish line |
| Vendor shutdown or lock-in | Open formats, local-first storage |

---

## 11. Open Questions (to decide before design)

1. **Platform:** Mobile app (Android/iOS), desktop web, or both? Is there a preferred tech stack?
2. ~~**Storage:**~~ **DECIDED (2026-11-21): local-only, single user, runs on the owner's machine.** No cloud or multi-device sync for now. Revisit later if needed; keep the data layer portable so this can change.
3. **Currency:** INR only for now, or multi-currency (e.g., US stocks)?
4. **Market data:** Which source for NAV (AMFI file is free) and stock prices (broker API, NSE data, or a paid provider)?
5. **Bank data:** File import only, or willingness to use an account aggregator (e.g., Setu, Finvu-type services) later?
6. **Tax:** Which regime (old/new) and which deductions should the tax summary cover?
7. **Shared finances:** Will anyone else (partner, family) need access later?
8. **Language:** English only, or other languages too?
9. **Budget method:** Category budgets (simpler) or zero-based (YNAB-style)?
10. **Build vs buy:** Build from scratch, or extend an open-source base such as Firefly III or Actual Budget for the expense side?

---

## 12. Glossary

- **SIP**: Systematic Investment Plan, a fixed recurring purchase of mutual fund units
- **NAV**: Net Asset Value, the per-unit price of a mutual fund
- **CAS**: Consolidated Account Statement covering all mutual fund holdings across AMCs
- **XIRR**: Extended Internal Rate of Return, annualized return for irregular cash flows
- **FIFO**: First In First Out, a cost basis method for selling shares
- **IDCW**: Income Distribution cum Capital Withdrawal (mutual fund dividend option)
- **EMI**: Equated Monthly Instalment for loans
- **PF / EPF / PPF / NPS**: Retirement and savings schemes in India
- **Emergency fund**: Liquid savings to cover essential expenses for several months
