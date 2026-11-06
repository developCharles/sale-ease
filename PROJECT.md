# SaleEase — A Touch-First, Offline-Ready Point-of-Sale for Small Business

SaleEase is a Progressive Web App (PWA) Point-of-Sale platform delivered as a SaaS product, built specifically for mobile and tablet touchscreens. It gives small-to-medium businesses checkout, inventory, and sales analytics without the hardware and paperwork overhead of traditional POS systems.

## Why it wins on adoption

1. **Zero installation friction.** Because it's a PWA, a merchant "installs" SaleEase with a single tap in the browser — no app-store account, no heavy download, no OS update to maintain. It runs smoothly even on low-end Android tablets, the reality for many PH micro-businesses.

2. **Offline-first by design.** Every transaction is saved on-device and auto-syncs when the connection returns. A coffee shop with spotty WiFi never stops selling, and never loses a sale.

3. **Flawless touch flow.** Every action — tapping products, adjusting cart quantities, cash tendering with automatic change calculation, accepting GCash/Maya/cash — is a continuous, thumb-reachable tap sequence. No typing, no menu digging, no swivel to a separate monitor. The goal is a customer's full order getting rung up in under 10 seconds.

4. **Multi-tenant SaaS model.** Owners get role-based staff access (fast 4-digit PIN login), per-business setup, and clean daily sales summaries.

**The pitch line:** "Technology that prioritizes the merchant's ease, so they can focus on expansion — not paperwork."

---

## On the POS vs. Sales Tracking question

**Important reality check:** BIR doesn't regulate your app, it regulates the merchant — they're the ones required to use accredited POS/CRM systems and print registered receipts. So the risk isn't a legal one for you; it's a positioning one.

**My recommendation — hybrid positioning:**

- **Lead with "sales tracking / sales management & analytics platform."** That's genuinely accurate (you're tracking sales, not issuing BIR-compliant receipts), and it dodges the "is this BIR-accredited?" question entirely.
- **Keep "POS" in the technical/university context** (capstone, engineering spec, features doc) since reviewers expect the term — but don't put "BIR-ready/registered" anywhere.
- **Present offline capability as inventory confidence, not tax evasion** — reframe as "your data is never lost, even mid-outage."

This is exactly how actual PH SaaS players position to stay honest-but-marketable. Just make sure you **never claim fiscal/BIR compliance** — that's the one line that could come back on both you and your merchant customers.

---

## Pre-Launch Checklist

> Not legal or tax advice. Confirm specifics with a PH accountant/lawyer before taking payment. This is a practical "don't get caught out" list.

### 1. Business & Tax Registration
- [ ] Register as **self-employed/professional** (DTI for sole prop, or SEC if incorporating)
- [ ] Get a **TIN** with BIR; secure a **Certificate of Registration (Form 2303)**
- [ ] Elect the **8% flat income tax** option (replaces graduated tax + percentage tax, while gross ≤ ₱3M/yr)
- [ ] Register **books of accounts** (manual or loose-leaf)
- [ ] Set up recurring filing calendar: **2551Q** (quarterly percentage tax), **1701Q** / **1701A** (income tax)
- [ ] Secure local permits if operating from a fixed place (mayor's/business permit)
- [ ] Open a **dedicated business account** (bank or GCash/Maya Business) — never mix personal funds
- [ ] Monitor the **₱3M/yr threshold** — crossing it forces 12% VAT registration and ends the 8% option

### 2. Contracts & Legal Shield
- [ ] Draft **Terms of Service** (subscription terms, cancellation, refunds, acceptable use)
- [ ] Publish a **Privacy Policy** compliant with the **Data Privacy Act (RA 10173)**
- [ ] Include a clear disclaimer: **"Not a BIR-accredited/registered fiscal system"**
- [ ] Define **SaaS liability limits** and a no-warranty clause in the ToS
- [ ] Put the **subscription agreement + pricing** in writing before creating each account
- [ ] Register as a **Personal Information Controller** with the NPC if handling personal data at scale

### 3. Data Protection & Security
- [ ] Enable **Supabase RLS (Row Level Security)** on every table — verify `tenant_id` isolation
- [ ] Confirm the **anon key is the only key** shipped to the client (never the service role key)
- [ ] Verify **per-tenant data isolation** end-to-end (no cross-tenant reads)
- [ ] Define a **data retention + deletion** policy (and honor deletion requests)
- [ ] Enable **Supabase backups** and confirm restore steps
- [ ] Store secrets in **Netlify env vars**, not in the repo

### 4. Product / Technical Readiness
- [ ] Verify `_redirects` works — deep links (`/app/cart`) don't 404 on refresh
- [ ] Test the **offline → online sync** flow on a real phone (airplane mode test)
- [ ] Confirm **PWA installability** (manifest, icons, theme color) on Android + iOS
- [ ] Replace placeholder logo/favicon with final branding
- [ ] Set the production **Supabase URL + anon key** in Netlify
- [ ] Delete the leftover `POS.jsx` and any dead code; run `npm run lint` + `npm run build`
- [ ] Basic error handling for failed payments/syncs (no silent failures)

### 5. Operations & Support
- [ ] Decide the **onboarding flow** (manual account creation + written agreement for MVP is fine)
- [ ] Set up a **support channel** (email/chat) and response expectations
- [ ] Prepare an **invoice/receipt template** for subscription payments
- [ ] Keep a **simple revenue ledger** (per-customer start date, amount, renewal) for tax filing
- [ ] Document a **refund/cancellation** procedure

### 6. Launch
- [ ] Soft-launch with **1–3 pilot merchants** before broad promotion
- [ ] Collect feedback + fix critical UX issues
- [ ] Run the pitch positioning: **"sales management & analytics,"** never "BIR-ready"
- [ ] Announce and start accepting subscriptions — registered and compliant