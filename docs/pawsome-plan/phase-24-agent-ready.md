# Phase 24 — AI-agent-ready store (WebMCP)

Goal: let browser AI agents shop the site through structured tools instead of scraping the UI,
using WebMCP, with zero effect on browsers that do not support it.

## Learn / explain
- WebMCP is an **emerging, still-changing browser API**: a page registers tools on
  `navigator.modelContext`; an in-browser agent calls them with JSON arguments. The page, not a remote
  server, executes them, with the visitor's own session and cookies.
- Why thin wrappers: the typed API client already validates, authorises and prices; tools add no new
  business rules, so an agent can never do what a user cannot.
- Progressive enhancement: feature-detect, register if present, otherwise do nothing. No polyfill
  (a polyfill would claim a capability browsers do not have and add code for no real user).
- Zod as the single source for tool input schemas (converted to JSON Schema for registration).
- Agents are untrusted callers: validate input, rate-limit, never expose payment steps.

## Step 24.1 — research spike + decision
- Read the current WebMCP draft/explainer and Chrome's early-preview notes; record in
  `04-decisions-log.md`: API shape used (`registerTool`/`provideContext` naming may differ by
  version), how to enable it for testing (browser flag), and the date checked. Keep the adapter in one
  file so spec churn touches one place.
- Commit: `docs: record webmcp api shape decision`

## Step 24.2 — tool registry (no browser API yet)
- `apps/web/src/features/agent/tools.ts`: array of `{ name, description, inputSchema (Zod), execute }`.
  Tools, each a wrapper over `apps/web/src/api/` functions (no new fetches):
  - `search_catalog` {query?, category?, brand?, maxPriceCents?, limit<=24} → `fetchProducts`
  - `get_product` {slug} → `fetchProduct`
  - `add_to_cart` {variantId, quantity 1..99} → `addCartItem`
  - `get_cart` {} → `fetchCart`
  - `update_cart_lines` {lines:[{itemId, quantity 0..99}]} → `updateCartItem`/`removeCartItem`
  - `search_shop_policies_and_faqs` {query} → FAQ/policy search.
- Results are compact JSON (id, name, price in cents + formatted + `currency`, availability boolean; the cart tools return phase 18's priced cart: lines, adjustments, total) and errors
  return `{ error: { code, message } }` using existing codes (`OUT_OF_STOCK`, `CART_CHANGED`, `TRIAL_LIMIT` etc.), never stack traces.
  No checkout or payment tool: an agent hands over to the human at the cart ("review and pay").
- Tests: schema accept/reject per tool; each execute calls the right client function (mocked).
- Commit: `feat(web): add agent tool registry over api client`

## Step 24.3 — policies and FAQ tool (depends on phase 20)
- **Depends on phase 20** (wave 1, always merged before this phase, so no flag): the tool calls the phase 20 client `searchHelp({q, topic?})` (`GET /help`) and returns title, answer text, URL of the page. Per-product Q&A (phase 16 `product_faqs`) is not part of this tool.
- Commit: `feat(web): add policies and faq agent tool`

## Step 24.4 — WebMCP adapter, feature-detected
- `features/agent/webmcp.ts`: `registerAgentTools()` returns early if
  `!('modelContext' in navigator)`; converts each Zod schema with `z.toJSONSchema`; registers tools;
  wraps execute in try/catch + `track('agent_tool_call', {tool})` (name only, no arguments).
- Called once from `main.tsx` after the app mounts; unregisters on `pagehide`.
- Types for the unfinished API declared locally in `env.d.ts` (optional members), no `any`.
- Tests: with a fake `navigator.modelContext` tools register with right names/schemas; without it the
  call is a no-op and does not throw.
- Commit: `feat(web): register tools with webmcp when available`

## Step 24.5 — safety limits
- Client-side cap: 30 tool calls/minute; quantity and list limits in schemas; the API's own auth,
  CSRF-origin check, stock rules, trial limits and global rate limit still apply unchanged.
- Cart mutations show a visible toast ("Assistant added Rope toy to your cart") so the human sees
  agent actions. Rejected: silent mutation.
- Tests: rate limiter, toast shown.
- Commit: `feat(web): add agent call limits and visible action feedback`

## Step 24.6 — /developers page
- Route `/developers` in `routes.tsx` with `<Seo>` (indexable): what WebMCP is and its experimental
  status, the six tools with example inputs/outputs (rendered from the registry so docs cannot drift),
  how to try it (browser version/flag as recorded in 24.1), what is deliberately not exposed, plain
  statement that it is a demo on test data. Link from the footer only.
- Commit: `feat(web): add developers page documenting agent tools`

## Step 24.7 — e2e
- Playwright injects a fake `navigator.modelContext` (init script), loads the store, asserts six tools
  registered, calls `search_catalog` → `get_product` → `add_to_cart` → `get_cart` through the fake and
  checks the cart page shows the item. A second test with no `modelContext` asserts no console errors.
  Real-browser agent testing is manual and noted in the page, not in CI.
- Commit: `test(e2e): add agent tools flow`

Phase 24 done when: in a WebMCP-capable browser an agent can find a product and fill the cart, a
non-supporting browser behaves identically to before, `/developers` documents it, gates and e2e green.

## Schema & API changes
No new tables, columns or endpoints: tools only reuse existing endpoints (catalog, cart, phase 20 FAQ).
Payments are never touched; where checkout is later exercised it uses the existing fake gateway.

## Touches shared files
`apps/web/src/main.tsx`, `routes.tsx` (`/developers`), Footer link, `env.d.ts`.
