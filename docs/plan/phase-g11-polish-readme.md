# Phase G11: Polish and README

Goal: a stranger opening the repo or the live site understands in two minutes what this project
shows: the logistics of quick grocery delivery, built on a reused e-commerce engine.

## Learn / explain
- **A case study, not a feature list.** The README leads with the problems (where can we deliver,
  when, what if it is missing, what does it weigh) and the decision behind each, with a diagram,
  then the stack and how to run it. Pawsome's README covers the engine; this one links to it.

## Step G11.1: QA sweep
- Every page type at 1280 and 375 px in both languages (home, department, PDP incl. weighed and
  short-dated, cart, checkout slot step, confirmation, account order with swaps, tracking, packer
  view, delivery page). Measure the repeated parts and flag outliers (sections taller than the
  screen, anything wider than the viewport, long labels, too many or too few items). Lighthouse
  accessibility on home, PLP, PDP, checkout. Fix what it finds, one `fix(...)` commit each.

## Step G11.2: README and case study
- `README.md`: one-paragraph pitch, live link, screenshots (`docs/screenshots/`), "The logistics"
  section with Mermaid diagrams (postcode → area → store; slot hold lifecycle; authorise → pick →
  swap → capture/refund; batches FEFO), the decisions with their trade-offs (from the decisions
  log), stack, local setup, tests, what was reused from Pawsome. `CREDITS.md` complete.
- Commit: `docs: grocery case study README`

## Step G11.3: phase end
- Gates + e2e, final handover (done / waiting on the owner, live URL), push, summary to the owner.
  Commit: `docs(plan): phase G11 done`
