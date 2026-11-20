# Aureon UI Design Direction and References

**Status:** Draft v0.1, 2026-11-21
**Scope:** Local-only, single-user personal finance app (see REQUIREMENTS.md, section 11)

## 1. Goal

The app should look deliberate and professional the moment it opens. It should not look like a default template, a stock admin dashboard, or the typical AI-generated "purple gradient card" layout. The design should feel like a well-made instrument: calm, precise, and easy to read at a glance.

## 2. Important caveat on sources

Live web search was unavailable during this session, so the references below come from prior knowledge. Entries marked **[verified]** were checked by opening the site. Everything else is **[to verify]**: open it yourself before relying on it. Use these as a starting list, and add references from Dribbble and Behance by searching "finance dashboard", "personal finance app", and "fintech dark mode".

## 3. Reference list

### 3.1 Personal finance apps (closest to the goal)

| Reference | Why it's useful | Status |
|---|---|---|
| **Actual Budget** (actualbudget.org, demo at demo.actualbudget.org) | Open source, local-first, and has light and dark versions of its budget and report screens. Good model for the structure of a budget view. Note the clean hierarchy and restrained color. | [verified] homepage and screenshot paths; demo not opened |
| **Copilot Money** (iOS/macOS) | Often cited as one of the most polished consumer finance designs. Strong category color system, clear charts, and calm dark mode. | [to verify] |
| **Monarch Money** | Clean dashboards with good net worth and goal presentation. | [to verify] |
| **Mercury** (banking) | Very restrained neutral palette and excellent number typography. Good reference for the "professional" feel. | [to verify] |
| **Wise** | Clear transaction lists and balance presentation. | [to verify] |
| **Firefly III** | Open source, self-hostable. Its site returned HTTP 403 to my tool, so check its demo directly. | [to verify] |

### 3.2 Data and product dashboards (best for numbers and charts)

| Reference | Why it's useful | Status |
|---|---|---|
| **Stripe Dashboard** | Gold standard for dense financial data: tables, tabular numerals, restrained charts, and clear hierarchy. | [to verify] |
| **Linear** (linear.app) | Best-in-class dark UI discipline: spacing, muted surfaces, one accent color, subtle borders. | [to verify] |
| **Vercel Dashboard** | Clean, minimal, monochrome with precise typography. | [to verify] |
| **Robinhood / Groww / Zerodha Kite** | Portfolio performance charts and P&L presentation. Useful for the investment screens. | [to verify] |

### 3.3 Design systems and typography

| Reference | Why it's useful | Status |
|---|---|---|
| **Geist** (Vercel font) | Clean sans-serif with good numerals. | [to verify] |
| **Inter** with `font-feature-settings: "tnum"` | Tabular figures so amounts align in columns. Essential for money. | [to verify] |
| **IBM Plex / Fraunces / Newsreader** | Serif or characterful display font for big headline numbers such as net worth. Gives a distinctive, editorial feel. | [to verify] |

### 3.4 Avoid as a base

- **Default admin templates** (stock Bootstrap, the default shadcn/ui dashboard example, and most free "Tailwind admin" kits). They are recognizable immediately and are the look you asked to avoid. Use their components at most, and restyle them heavily.

## 4. Design principles

1. **Numbers first.** Amounts use tabular figures, right-aligned, with a consistent sign and currency format. Indian grouping (lakhs and crores) by default.
2. **One accent color.** Use one brand accent for actions and highlights. Category colors are secondary and muted.
3. **Color means something.** Green and red are reserved for gains and losses, and for income and expense. Never decorative.
4. **Density with breathing room.** Show a lot of information, but group it with whitespace and clear section headings.
5. **Dark mode is primary.** Light mode is supported, but design the dark theme first. It suits a dashboard that is opened often.
6. **Motion is subtle.** Short transitions on numbers and charts. No bounce or decorative animation.
7. **Privacy by default.** One key or button masks all balances (requirement SEC-06).

## 5. Three design directions

These are concepts to choose from. Each is a complete direction, not a color swap.

### Direction A: "Ink and Signal" (dark, precise, data-first)
- **Background:** near-black blue-grey (#0E1116), surfaces slightly lighter (#161B22), hairline borders
- **Accent:** a single electric teal (#2DD4BF) for actions and the net worth line
- **Type:** Geist or Inter with tabular numerals; monospace for transaction IDs only
- **Feel:** trading-terminal clarity, like a well-built instrument panel
- **Fits:** the investment-heavy side of the app (stocks and MFs)

### Direction B: "Paper Ledger" (light, editorial, calm)
- **Background:** warm off-white (#F7F5F0), ink text (#1C1B19), no heavy shadows
- **Accent:** deep green (#1F5C4A) with a muted terracotta for negatives (#B5533C)
- **Type:** a serif display (Newsreader or Fraunces) for big totals and headings, sans-serif for tables
- **Feel:** a printed annual report or a private banking statement
- **Fits:** a relaxed, premium look for daily use and monthly reviews

### Direction C: "Graphite and Amber" (dark, warm, personal)
- **Background:** warm charcoal (#14120F), surfaces (#1C1915)
- **Accent:** amber (#F5A524) for primary actions and progress; muted sage (#7FA37A) for gains
- **Type:** Inter for UI, a condensed display for headline numbers
- **Feel:** warm and personal, less cold than Direction A

**Recommendation:** Direction A for the dark theme and Direction B for the light theme, sharing the same component structure and spacing. This gives a professional look that is clearly not a default template. Final colors should be checked for contrast (WCAG AA minimum, requirement UX-05).

## 6. Screen-by-screen layout (proposal)

1. **Home / Overview:** top row with net worth (large numeral and trend sparkline), this month's income, spend and savings. Below it: cash flow chart, budget status, and upcoming bills and SIPs.
2. **Transactions:** a fast quick-add bar at the top (amount, category, enter to save). Below it: a dense, filterable list grouped by day.
3. **Budgets:** one row per category with progress bar, spent, remaining and projected end-of-month.
4. **Investments:** portfolio summary (invested, current, XIRR, day change), then tabs for Mutual Funds and Stocks. Each holding is a row with a small sparkline.
5. **Net worth:** assets and liabilities as stacked bars and a trend line over time.
6. **Reports:** monthly review card layout with a print-friendly view.
7. **Settings:** plain and functional.

## 7. Decisions (2026-11-21)

- **Direction:** A, "Ink and Signal" (dark, data-first). Light theme (Direction B) deferred.
- **Font stack:** the system UI stack, so the app matches the OS and needs no web font download:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
  with `font-variant-numeric: tabular-nums` on all money values.
  Note: system fonts give a native feel but are not distinctive on their own. Distinction comes from layout, spacing, and the colour system, not the typeface.
- **Palette (revised 2026-11-21):** zinc dark, per the Aureon spec. Background `#09090b` (zinc-950), card `#0f0f12`, borders `#27272a` (zinc-800), hover `#18181b` (zinc-900), muted text `#a1a1aa` (zinc-400). Teal `#2dd4bf` is kept as a single accent, used sparingly. Green `#4ade80` marks income, red `#f87171` marks expenses.
- **Numbers:** KPI values and amounts use a monospace stack with tabular figures (`font-mono`-style). Headings and labels use the system font.
- **Components:** rounded-lg cards (0.5rem), p-4 padding, hairline borders with a subtle hover lift. Buttons get a hover background and `scale(0.95)` on press.
- **Grid:** KPI ribbon at 1 / 2 / 4 columns (mobile / sm / lg). Analysis blocks at 1 / 2 / 3 columns.
- **Sidebar:** shown from the `lg` breakpoint, hidden on small screens.
- **Privacy mask:** the `.maskable` class is blurred (6px) when the privacy toggle is on.
- **Layout style:** dashboard blocks (bento grid). Each KPI, chart, or list is a self-contained card on a 4-column grid, with cards spanning 1 to 4 columns and some spanning 2 rows. Cards have a hairline border, 14px radius, and no shadows.

## 8. Mockup

`ui/mockup/overview.html` is a static, single-file mockup of the Overview screen in Direction A. It uses sample data and has no dependencies. Open it in a browser to review it. It is a visual mockup only, with no logic.

## 9. Next steps

1. Review the mockup and list what to change: block sizes, which blocks matter most, density.
2. Check the [to verify] references if you want more inspiration for the other screens.
3. Decide the frontend stack for a local web app. This is a separate decision in the design phase.
