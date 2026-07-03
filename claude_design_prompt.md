# Claude Design Prompt — PRNEWS.IO Partner Site Monitor Dashboard

## Project Overview
Design a **monitoring dashboard** for PRNEWS.IO — a PR content platform that tracks 105,000+ partner publisher websites. The dashboard should feel like a professional SaaS tool: data-dense but clean, with clear status communication.

---

## Visual Style
- **Tone:** Professional B2B SaaS. Think Linear, Vercel Dashboard, or Datadog — light mode with dark sidebar.
- **Colors:**
  - Primary: `#2563EB` (blue)
  - Status: Green `#16A34A` · Yellow `#D97706` · Red `#DC2626` · Gray `#6B7280` · Orange `#EA580C`
  - Background: `#F8FAFC` with white cards, `1px` border `#E2E8F0`
  - Sidebar: `#0F172A` dark with white text
- **Typography:** Inter — clean, legible at small sizes
- **Density:** Medium-high. Used by ops teams daily.
- **Border radius:** `8px` cards, `6px` badges, `4px` inputs

---

## Screens to Design

### 1. Main Dashboard `/sites`
**Layout:** Fixed dark sidebar (240px) + main content area

**Sidebar:**
- PRNEWS.IO logo at top + "Site Monitor" sublabel in gray
- Nav items with icons: Dashboard · Sites · Alerts · Reports · Settings
- Active item: blue highlight background
- Bottom widget (status pill summary):
  `● 98,240 Active  ⚠ 3,107 Warning  ✗ 740 Issues`

**Top stats row — 4 cards:**
| Metric | Value | Delta |
|--------|-------|-------|
| Total Sites | 105,000 | +240 this week |
| Active | 98,240 (93.6%) | green |
| Issues | 3,847 | ↑ 12 since yesterday (red) |
| Last Full Scan | 2h ago | Next in 22h |

**Filter bar (below stats):**
- 🔍 Search: "Search domain..."
- Dropdown: **Status** — All / Active / Warning / Unreachable / Parked / Blacklisted / Suspended
- Dropdown: **Country** — All / US / UK / DE...
- Dropdown: **Category** — All / Technology / Business...
- Slider: **DR** — 0 to 100
- Button: `Import CSV` (primary blue) · `Export CSV` (outline)

**Sites table:**
| # | Domain | Country | DR | Traffic | Status | SSL | Last Check | |
|---|--------|---------|----|---------|----|-----|------------|--|
| 1 | techcrunch.com | 🇺🇸 | 86 ↑ | 2.4M/mo | ● Active | ✓ 187d | 2h ago | ··· |
| 2 | spamsite.net | 🇷🇺 | 12 ↓ | 800/mo | ● Blacklisted | ✗ | 2h ago | ··· |

- Status: colored pill badge (15% opacity bg + matching text)
- DR: number + small ↑↓ trend arrow colored green/red
- SSL: green checkmark + days remaining OR red ✗
- Row hover: light blue tint + "View →" appears in last column
- Column headers: clickable for sort, show ↕ arrows
- Pagination: 50 rows/page, "Showing 1–50 of 105,000"

---

### 2. Site Detail Page `/sites/techcrunch.com`

**Header:**
- ← Back to Sites
- Large domain: **techcrunch.com** + `● ACTIVE` badge
- Meta: 🇺🇸 English · Technology · Added Jan 15, 2023
- Buttons: `Re-check Now` · `Suspend Site` · `Export Report`

**Tabs:** Overview · SEO Metrics · Check History · Alerts

**Overview — metrics grid (3 columns):**

Row 1 — Availability:
- HTTP Status: `200 OK` (green icon)
- Response Time: `342ms` with horizontal bar (green < 1s, yellow 1-5s, red > 5s)
- SSL Certificate: `Valid · expires in 187 days` (green)

Row 2 — SEO:
- Domain Rating: `86` + sparkline chart (last 30 days)
- Organic Traffic: `2.4M / mo` + sparkline
- Indexed Pages: `48,200`

Row 3 — Content:
- Last Publication: `3 days ago` (green)
- Content Type: `Active blog` 
- Parking Detected: `No` (green)

Row 4 — Safety:
- Google Safe Browsing: `✓ Clean`
- Spamhaus DBL: `✓ Not listed`
- PhishTank: `✓ Clear`

Row 5 — Compliance:
- About Page: `✓ Found`
- Privacy Policy: `✓ Found`
- Language Match: `✓ EN confirmed`
- MX Records: `✓ Present`

**History tab:**
- Line chart: DR (blue) + Traffic (green) over last 6 months
- Table below: each scan row with all metrics, expandable

---

### 3. Alerts Page `/alerts`

**Filter row:** All · Unresolved · Critical · Warning · Dismissed | Date range picker

**Alert list — each item:**
```
[severity icon] [domain]          [alert message]                    [time]     [actions]
⚠️  techcrunch.com    DR dropped: 86 → 74  (−12 pts)              2h ago     [View Site] [Dismiss]
🔴  spamsite.net      Added to Google Safe Browsing blocklist      5h ago     [View Site] [Dismiss]
⚠️  oldnews.com       No content updates in 91 days               1d ago     [View Site] [Dismiss]
ℹ️  ssl-expiring.com  SSL expires in 12 days                      3h ago     [View Site] [Dismiss]
```

- 🔴 Critical (red left border) · ⚠️ Warning (yellow) · ℹ️ Info (blue)
- Dismissed items: grayed out, strikethrough domain name
- Empty state: illustration + "🎉 No active alerts — everything looks good"

---

### 4. Import CSV Modal

**Step 1 — Upload:**
- Large drag-and-drop zone with dashed border
- Icon + "Drop your CSV here or **browse files**"
- Format hint: `domain, country, language, category, dr_at_signup, added_date`
- "Download template CSV" link

**Step 2 — Preview:**
- "Detected 105,000 rows" header
- Table showing first 5 rows
- Column mapping confirmation (auto-detected)
- `Start Import` button (primary blue)

**Step 3 — Progress:**
- Large progress bar: blue fill animated
- "Importing 105,000 domains..."
- Live counter: `42,300 / 105,000 processed`
- Current batch status: "Batch 85/210 · ETA 3m 20s"

**Step 4 — Success:**
- Green checkmark animation
- "✓ 104,987 sites imported"
- "13 skipped (duplicates)"
- `View All Sites →` button

---

---

## ADDITIONAL SCREENS — SaaS Platform & User-Facing UI

> The screens below are for the **public-facing SaaS product** built on top of the monitoring engine. The same product, two experiences: regular users see their own sites; PRNEWS internal login reveals the full engine.

---

### 5. Landing Page `/`

**Hero section:**
- Headline: **"Know which sites are alive before you spend a dollar"**
- Subheadline: "Monitor publisher health, catch dead sites, protect your PR budget."
- Two CTAs side by side: `Start for Free` (blue, filled) · `Check a Site Now` (outline)
- Below CTAs: "No credit card required · Free plan includes 5 sites"
- Hero visual: split mockup showing a site health dashboard on one side, a "DO NOT BUY ⛔" alert badge on the other

**Live demo widget (interactive, no login):**
- Input field: "Enter any domain..."
- `Check Now` button
- After submit: show animated loader → result card:
  ```
  ✅ techcrunch.com
  Health Score: 94/100
  Status: Active · SSL: 187 days · Safe: Yes
  ```
- Below widget: "See full report → Sign up free"

**Features section — 3 columns:**
| Icon | Title | Description |
|------|-------|-------------|
| 🔍 | Pre-Purchase Check | Verify any site in seconds before buying a placement |
| 📊 | Campaign Monitor | Track all sites where you placed content — get alerted if they go dark |
| 🚨 | Instant Alerts | Email or Slack when a monitored site goes down, gets blacklisted, or parks |

**Social proof bar:**
- "Trusted by 500+ agencies and PR teams"
- Logo row: placeholder logos of agency types

**Pricing section — 4 cards:**
```
Free          Starter $9/mo    Pro $29/mo      Agency $79/mo
5 sites       20 sites         200 sites       2,000 sites
Daily check   Daily check      6h check        1h check
Email alerts  Email + Slack    + Bulk CSV       + White-label PDF
              -                + API access     + API access
[Get Started] [Start Trial]    [Start Trial]    [Contact Us]
```

**Footer:** Logo · Product · Pricing · Blog · Login · Sign Up

---

### 6. Auth Screens

**Register `/register`:**
- Card centered on page, max-width 440px
- Logo at top
- Fields: Email · Password · Confirm Password
- Button: `Create Free Account`
- Below: "Already have an account? Log in"
- OR divider → `Continue with Google`
- Legal: "By signing up you agree to our Terms and Privacy Policy"

**Login `/login`:**
- Same card layout
- Fields: Email · Password
- "Forgot password?" link inline
- Button: `Sign In`
- Special section at bottom (subtle, gray bg, small text):
  ```
  PRNEWS.IO Internal Access
  [Sign in with PRNEWS credentials →]
  ```
  → This button leads to a separate login that sets role=prnews and unlocks the full internal engine

---

### 7. User Dashboard `/dashboard` (PUBLIC role)

**Layout:** Same sidebar as internal dashboard but narrower feature set

**Sidebar nav:**
- My Sites · Alerts · Bulk Check · Campaign Monitor · Settings · Upgrade Plan

**Top bar:**
- Plan badge: `PRO` (blue pill) or `FREE` (gray pill)
- Sites used: `12 / 200`
- Upgrade button (if not agency)

**My Sites table:**
- Columns: Domain · Health Score · Status · SSL · Last Check · Actions
- Health Score: colored number (green 80+, yellow 50-79, red <50) + thin progress bar
- Add site button: `+ Add Domain` (opens modal with domain input)
- Empty state: "You haven't added any sites yet. Add your first domain →"

**Quick check widget (sidebar or top of page):**
- "One-off check" — enter any domain, instant result, not saved
- Available to all plans
- Rate limited: 10/day free, 100/day pro

---

### 8. Pre-Purchase Checker `/check` (CLIENT role)

> This is what PRNEWS/Medialister buyers use BEFORE buying a placement

**Full-page tool layout:**

**Input area:**
- Large centered input: "Enter domain to check..."
- `Check Now` button (big, blue)
- Below: "Or upload a list → Bulk Check (Pro)"

**Result card (after check):**
```
┌──────────────────────────────────────────────────┐
│  techcrunch.com                    ✅ SAFE TO BUY │
│  ─────────────────────────────────────────────── │
│  Health Score          94 / 100                  │
│                                                  │
│  ✅ Reachable          200 OK · 342ms            │
│  ✅ SSL Valid          Expires in 187 days        │
│  ✅ Not Parked         No parking detected        │
│  ✅ Safe Browsing      Clean                      │
│  ✅ Spamhaus           Not listed                 │
│  ✅ Active Content     Last post 3 days ago       │
│  ⚠️  Language          EN declared, EN detected   │
│                                                  │
│  Checked: Jan 15, 2024 · 10:32 UTC              │
│  [Save to Campaign]  [Check Another]             │
└──────────────────────────────────────────────────┘
```

Recommendation badge colors:
- `✅ SAFE TO BUY` — green (score 75+, no blacklist, no parking)
- `⚠️ PROCEED WITH CAUTION` — yellow (score 50-74 or minor issues)
- `⛔ DO NOT BUY` — red (unreachable, parked, blacklisted)

**Bulk Check tab:**
- Drag-and-drop CSV upload (domains list)
- Progress bar while checking
- Results table: domain · score · status · recommendation
- Export as CSV button

---

### 9. Campaign Monitor `/campaigns` (CLIENT role)

> Track sites where placements were already bought — alert if they die

**Campaign list:**
- Cards or table: Campaign Name · Sites Count · Healthy · Issues · Created
- `+ New Campaign` button

**Campaign detail `/campaigns/{id}`:**
- Campaign name + date range
- Stats bar: X sites · Y healthy · Z issues
- Table: Domain · Placement Date · Placement URL · Current Status · Health Score · Alert
- Row color coding: green (healthy) · yellow (warning) · red (down after placement)
- Alert column: "⚠️ Down since Jan 18 — placement at risk"
- Button: `Export Health Report` → PDF or CSV for client proof/refund

---

### 10. Settings Page `/settings`

**Tabs:** Profile · Notifications · API · Billing

**Notifications tab:**
- Email alerts: toggle on/off · input field for email
- Slack: toggle + webhook URL input + `Test Webhook` button
- Alert conditions checkboxes:
  - [ ] Site becomes unreachable
  - [ ] SSL expires in < 14 days
  - [ ] Site gets blacklisted
  - [ ] Site becomes parked
  - [ ] No content update in 90+ days

**API tab (Pro/Agency only):**
- API Key display (blur + reveal button + copy button + regenerate)
- Code snippet showing example curl request
- Link to API docs

**Billing tab:**
- Current plan badge + renewal date
- Usage bar: "12 of 200 sites used"
- Plan comparison table
- `Upgrade` / `Cancel Plan` buttons

---

## Navigation Logic by Role

```
PUBLIC user sees:
  Sidebar: My Sites · Alerts · Bulk Check · Campaign Monitor · Settings

CLIENT user (PRNEWS buyer) sees:
  Sidebar: Pre-Purchase Check · My Campaigns · Settings

PRNEWS internal sees:
  Sidebar: Overview · All Sites · Alerts · Import/Export · Settings
  + Banner: "PRNEWS Internal Mode" (subtle blue top bar)
  + Full 105k catalog
  + Suspend/unsuspend controls
  + Auto-deactivation logs
```

---

## Deliverables Priority (updated)

1. **Landing page** — hero + live demo widget + pricing
2. **Main internal dashboard** — sidebar + stats + sites table (PRNEWS role)
3. **Pre-Purchase Checker** — result card with recommendation badge
4. **User dashboard** — My Sites table + health scores (PUBLIC role)
5. **Campaign Monitor** — campaign detail with placement health
6. **Auth screens** — login + register + PRNEWS internal login CTA
7. **Site detail page** — metrics grid + tabs
8. **Alerts page**
9. **Settings page**
10. **Import CSV modal**

---

## Component Library Notes
- All tables: sortable columns, row hover highlight, skeleton loaders
- Charts: minimal axes, no grid clutter, tooltips on hover
- Badges/pills: `font-size: 11px`, `font-weight: 600`, uppercase or sentence case
- Cards: `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`, white bg, 8px radius
- Health Score: always shown as colored number + thin horizontal bar (green/yellow/red)
- Recommendation badge: large, bold, color-coded (green/yellow/red) — most important UI element
- Responsive: sidebar collapses to icons on narrow screens; landing page is fully responsive
- Role switching: no visible "switch role" UI — role is determined at login and persists

> Make it feel like two products in one: a clean SaaS tool for agencies and a powerful internal engine for the PRNEWS team. The landing page sells the SaaS; the internal login reveals the engine.
