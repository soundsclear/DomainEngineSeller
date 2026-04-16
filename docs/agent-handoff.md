# Agent Handoff

This file is the shared coordination log for Codex, Claude Code, and any future coding agent working in this repo.

Update this file when you:
- make non-obvious architectural or workflow choices
- change ports, local dev assumptions, or env usage
- merge branches with meaningful conflict resolution
- leave work half-finished
- discover bugs, blockers, or temporary workarounds
- finish a session with new operational knowledge another agent could trip over

Keep it short, concrete, and current.

## Claude TL;DR

- Read this file first before continuing work.
- Current branch: `feature/inbox-reply-intelligence`
- Main coordination doc: this file is the shared source of truth between agents.
- Admin UI is on the newer Apple-style redesign and merge conflicts with `main` were resolved.
- The discussed redesign is the only valid UI/UX direction for this repo right now.
- Do not reintroduce older public or admin UI patterns, layouts, or copy unless the user explicitly asks for that.
- Buyer discovery now chains:
  - AI reasoning
  - Brave search
  - Apify enrichment for stronger matches
- Public pages were updated to align with the redesign, but public-page polish is still in progress.
- Public pages must stay customer-facing:
  - no internal pricing labels like `Quick sale`, `Target`, or `Aspirational`
- Local dev standard is now:
  - frontend on `5173`
  - worker on `8787`
  - Vite proxy points to `8787`
  - start with `pnpm dev:up`
- Do not trust a running server on `5173` or `8787` unless the owning process command line points at this exact repo root.
- Side worktree processes such as `.claude/worktrees/...` can serve stale UI and must be treated as invalid for verification.
- If you continue public-page work, check:
  - `src/components/PublicShell.tsx`
  - `src/pages/PublicPortfolioPage.tsx`
  - `src/pages/PublicDomainPage.tsx`

## Current Snapshot

- Updated by: Codex
- Date: 2026-04-15
- Branch: `feature/inbox-reply-intelligence`
- HEAD: `c6207e8`

## Latest Local Dev Correction (2026-04-15)

- Root cause of the "old UI is still showing" issue was not the router in this workspace.
- `localhost:5173` and the worker had been started from a stale Claude side worktree:
  - `C:\Users\FD111\Documents\Domain Seller Engine\.claude\worktrees\happy-knuth`
- That stale worktree served outdated UI and caused false verification results.
- The worker/proxy mismatch also caused `502` errors:
  - Vite was still proxying `/api` to `8790`
  - current worker is on `8787`
- Fixed now:
  - stale side-worktree processes were stopped
  - frontend was restarted from the main repo
  - worker was restarted from the main repo
  - `vite.config.ts` now proxies `/api` to `http://127.0.0.1:8787`
  - added `pnpm dev:up`
- `pnpm dev:up` is now the default startup path because it:
  - checks who owns ports `5173` and `8787`
  - kills stale listeners from outside this repo
  - starts frontend and worker from the current repo only
  - confirms the owning command lines after startup
- This should be the standard for both Codex and Claude Code going forward.

## Latest Verification Pass (2026-04-15)

- `pnpm test:run` is green again:
  - `252` test files passed
  - `1823` tests passed
- Regressions fixed:
  - worker outreach-send tests now account for `OUTREACH_CONTACT_ENABLED`
  - `DomainDetailPage` test now reflects the current enrichment-only buyer-discovery UX instead of the removed outreach-draft flow
- Docs refreshed:
  - `docs/phase1-status.md`
  - `docs/architecture.md`
- Runtime smoke verified:
  - `/` returns `200`
  - `/admin` returns `200`
  - `/api/health` returns healthy status
  - `/api/domains`, `/api/inquiries`, `/api/public/portfolio`, and `/api/metrics/dashboard` respond locally
- Live outreach transport test executed successfully to:
  - `info@soundsclear.nl`
  - via the same `sendOutreachEmail` path used by the application

## What Claude Code Added (claude/happy-knuth)

- Phase 1 backend work: DB-backed leads CRUD, provider-transaction-repository,
  4 new dashboard metrics, Stripe removal, getDashboardMetrics migration fix
- Public lander visual layer: dark navy shell (#071328), radial glow, glass cards,
  large domain name hero (clamp 32–72px), "Dit domein is te koop" badge
- Replaced Quick sale/Target/Aspirational with single "Vraagprijs" on domain pages
- Removed internal pricing line from portfolio cards
- Brought Codex's filter UI + Turnstile CAPTCHA from feature/inbox-reply-intelligence
  into this branch
- Worker port on this machine fluctuates between 8787 and 8789 depending on what
  is already running; vite.config.ts in happy-knuth currently proxies to 8787

## Previous Snapshot (Codex)

## Working Agreements

- Treat this file as the first read before making further changes in an ongoing session.
- Do not overwrite another agent's notes; append or update sections clearly.
- If you intentionally choose a temporary workaround, say why and what should replace it.
- If local-only secrets or setup are involved, document the mechanism, not the secret value.

## What Was Done

- Resolved merge conflicts between the Apple-style redesign work and newer `main` functionality.
- Kept the redesigned Apple-style UI while preserving newer leads, deals, dashboard, and provider-transaction functionality.
- Fixed the leads empty-state regression so the leads section and create form still appear when there are no leads.
- Fixed buyer-discovery empty-state behavior so the page does not crash or disappear when lead lists are empty.
- Added safer API parsing in `src/lib/api.ts` so plain-text error responses no longer explode during JSON parsing.
- Added a fallback for dashboard metrics so the frontend can survive if `/api/metrics/dashboard` is unavailable and fall back to legacy `/api/dashboard`.
- Integrated Apify contact enrichment into buyer discovery:
  - AI reasons about likely buyer fit
  - Brave Search gathers candidates
  - Apify enriches stronger matches with public contact data
  - best contact snapshot is written back into the lead/contact records so the UI and outreach can use it directly
- Fixed the manual lead-enrichment UI flow in `DomainDetailPage` so it hits the real worker endpoints instead of a dead route.
- Reworked the public-facing portfolio and per-domain landing pages to align with the newer Apple-style UI language.
- Removed internal-only pricing language from public pages:
  - no `Quick sale`
  - no `Target`
  - no `Aspirational`
- Replaced public pricing communication with customer-facing language such as:
  - `Vraagprijs`
  - `Beschikbaar`
  - `Direct contact`
- Added a clearly visible hero badge on public domain pages stating:
  - `Dit domein is te koop`
- Improved public page proportions and hierarchy:
  - better hero balance
  - better CTA contrast
  - better card overflow handling
  - more balanced content/form layout on the public domain page
- Confirmed public portfolio data is now visible locally and public routes are rendering domain cards and domain landers again.

## Important Decisions

- Buyer discovery remains conservative:
  - AI plus Brave decides likely buyer candidates first
  - automatic Apify enrichment only runs for stronger matches
  - this avoids burning enrichment calls on weak or noisy candidates
- Contact enrichment is public-data-only and research-only; nothing auto-sends.
- The UI should always remain usable in empty states; avoid early returns that hide the page shell or forms.
- Public pages must use customer-facing language only. Internal valuation or ops terms should not be shown to visitors.
- The new Apple-style redesign is the single source of truth for both admin and public UI.
- Any UI work should align with the new redesign and replace older styles rather than coexist with them.
- If an older UI still appears anywhere, treat it as drift to be corrected.

## Local Dev Status

- Frontend dev server: `http://127.0.0.1:5173`
- Worker expected by Vite proxy: `http://127.0.0.1:8787`
- `vite.config.ts` proxies `/api` to port `8787`
- Standard startup command:
  - `pnpm dev:up`
- Public routes:
  - `/`
  - `/portfolio`
  - `/d/:domainId`
- Admin routes:
  - `/admin`
  - `/admin/inbox`
  - `/admin/deals`
  - `/admin/domains`
  - `/admin/leads`
  - `/admin/settings`

## Local Dev Rule

- Never assume a listening dev server is the right one just because the port is open.
- Before verifying UI, confirm the process owner command line points at:
  - `C:\Users\FD111\Documents\Domain Seller Engine`
- If the process points at `.claude/worktrees/...`, stop it and restart with `pnpm dev:up`.

## Env / Integrations

- Apify is integrated locally through `.dev.vars` using `APIFY_API_TOKEN`.
- Current code does not require an Apify user id for this flow.
- Default Apify actor in code is `poidata/contact-details-scraper` unless overridden by `APIFY_CONTACT_SCRAPER_ACTOR_ID`.

## Files Most Relevant To Recent Changes

- `src/server/ai/buyer-discovery.ts`
- `src/server/ai/apify-contact-enrichment.ts`
- `src/server/db/lead-repository.ts`
- `src/server/db/lead-enrichment-repository.ts`
- `src/pages/DomainDetailPage.tsx`
- `src/pages/LeadsPage.tsx`
- `src/pages/DealsPage.tsx`
- `src/components/PublicShell.tsx`
- `src/pages/PublicPortfolioPage.tsx`
- `src/pages/PublicDomainPage.tsx`
- `src/lib/api.ts`
- `worker/index.ts`
- `vite.config.ts`

## Current Process Status

- Admin-side Apple-style redesign is active.
- This redesign is the canonical UI/UX direction for the product.
- Buyer discovery now chains AI reasoning, Brave search, and Apify enrichment for stronger matches.
- Public portfolio is visible locally again.
- Public domain landing pages are mid-polish but already much closer to the intended direction.
- Remaining work is mostly refinement:
  - continue improving public-page visual proportions
  - audit public copy for any remaining internal wording
  - optionally improve trust signals and premium sales presentation

## Open Follow-Ups

- Investigate why local worker port `8787` served stale or incomplete route behavior while `8790` worked.
- Consider surfacing buyer-discovery confidence and auto-enrichment reasons in the UI.
- Consider documenting the buyer-discovery plus enrichment pipeline in `docs/architecture.md` once the flow stabilizes.
- Continue polishing the public portfolio and landers so they feel fully premium and customer-ready.

## How To Continue

- If you are continuing buyer discovery work:
  - read `src/server/ai/buyer-discovery.ts` first
  - then check `worker/index.ts` buyer-discovery and enrichment endpoints
  - then verify `DomainDetailPage.tsx` still reflects the actual API response shape
- If you change ports or dev assumptions, update this file immediately.
