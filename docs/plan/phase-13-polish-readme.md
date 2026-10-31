# Phase 13 — Polish, README, demo readiness

Goal: make it read as production-minded work to a stranger with five minutes.

## Step 13.1 — accessibility and UX pass
- Keyboard-only walk of the full purchase; screen reader (NVDA/VoiceOver) on PDP and checkout;
  colour contrast check; focus order in dialogs/drawers; form error announcements; Lighthouse a11y ≥
  95 on the 5 key pages. Fix what fails.
- Commit: `fix(web): accessibility pass`

## Step 13.2 — edge-case QA (per the QA rules)
- Long product names, 0 results, 1 result, 500 results pagination, cart with 20 lines, sold-out
  everything, viewport 320 px, zoom 200 %, slow network (Chrome throttling) — look for anything wider
  than the viewport or taller than makes sense. Fix outliers.
- Commit: `fix(web): edge case layout fixes`

## Step 13.3 — error and empty states
- API down banner (health poll failing), 404 product, expired session mid-checkout (re-login keeps
  cart), webhook late (confirmation copy), Stripe element load failure.
- Commit: `feat(web): resilient error and empty states`

## Step 13.4 — README as a case study
- Sections: what it is + demo link + test card · screenshots/GIF · architecture diagram (Mermaid) ·
  stack and **why each choice** (from the decisions log) · data model diagram · the checkout
  sequence diagram · "things I'd do differently / what's next" (honest) · local setup · testing ·
  deployment · licence (MIT) · image credits link. No personal data beyond name/links he chooses.
- `CONTRIBUTING.md` short; `LICENSE`.
- Commit: `docs: write readme case study`

## Step 13.5 — demo data refresh + admin demo access
- Decide: public admin demo credentials in README (read-only risk: anyone can edit the demo store).
  **Default:** yes, with a nightly `db:reset` (GitHub Actions cron hitting a protected
  `/admin/reset-demo` endpoint or running the seed against Neon) so vandalism is temporary. Ask him.
- Commit: `ci: nightly demo data reset`

## Step 13.6 — interview prep sheet
- `docs/interview-notes.md`: 20 likely questions with his answers, one per decision. Written by him
  with the session's help at the end. Also prune `docs/plan/`: keep the data model, API contract and
  decisions log; delete phase files whose substance is now in the code and README.

## Step 13.7 — final gates
- Fresh clone test on a clean machine/user following only the README; full CI green; gitleaks clean;
  tag `v1.0.0` (on his go).

Project done when the whole-project definition of done in `03-conventions.md` is met.
