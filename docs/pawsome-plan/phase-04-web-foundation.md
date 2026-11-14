# Phase 4 — Web foundation

Goal: the app shell, routing, design system primitives, typed API client, query setup, and the
SEO/analytics guard-rails — so feature phases only add pages.

## Step 4.1 — Tailwind + design tokens
- Tailwind config with a **colourful** palette: a warm primary (coral/orange), a deep neutral for
  text, and **one accent per pet category** (dogs amber, cats violet, birds teal, fish sky blue,
  small pets lime) exposed as CSS variables so category pages, badges and cards switch accent via
  `data-pet="dog"` on a wrapper. Rounded corners, playful but readable display font + clean body
  font from Google Fonts self-hosted via `@fontsource` (no runtime font requests — future CWV project
  will thank us). Contrast checked: every accent used for text passes WCAG AA on its background. `styles/globals.css` with base resets,
  focus-visible ring, `prefers-reduced-motion`.
- Learn / explain: utility CSS trade-offs; design tokens; why self-host fonts.
- Commit: `feat(web): add tailwind and design tokens`

## Step 4.2 — UI primitives (own, small)
- `components/ui/`: `Button` (variants, sizes, loading, `asChild`-free — keep simple), `Input`,
  `Select`, `Checkbox`, `Badge`, `Skeleton`, `Dialog` (native `<dialog>` + focus trap), `Toast`
  (context + `aria-live`), `Price` (uses shared `formatMoney`), `Spinner`, `VisuallyHidden`.
- Each has a Vitest/Testing Library test for its accessibility contract (labels, roles, keyboard).
- Learn / explain: accessible names, focus management, `aria-live`.
- Commit: `feat(web): add accessible ui primitives`

## Step 4.3 — layout
- `components/layout/`: `Header` (logo, nav from categories, search box, cart icon with count badge,
  account menu), `Footer`, `Container`, `Breadcrumbs`, `MobileNav` (drawer). Responsive at 360 / 768 /
  1024 / 1280.
- Skip link, landmarks (`header`, `main`, `nav`, `footer`).
- Commit: `feat(web): add app layout`

## Step 4.4 — routing
- `routes.tsx` with `createBrowserRouter`: `/`, `/c/:slug`, `/products/:slug`, `/search`, `/cart`,
  `/checkout`, `/checkout/confirmation/:number`, `/account/*`, `/login`, `/register`, `/admin/*`,
  `*` → NotFound. Route-level `lazy()` for checkout, account, admin. Error boundary route element.
  Scroll restoration.
- Learn / explain: data router vs plain `<Routes>`; code splitting; error boundaries.
- Commit: `feat(web): add routes with code splitting`

## Step 4.5 — API client
- `src/api/client.ts`: `apiFetch<T>(path, { method, body, schema })` — sets `credentials: 'include'`,
  JSON, parses with the shared Zod schema (**runtime-validated responses**), throws `ApiError(code,
  status, details)`. One file per resource: `api/catalog.ts`, later `auth.ts`, `cart.ts`, …
- `lib/query-client.ts`: TanStack Query defaults (staleTime 60 s for catalog, retry only on 5xx).
  Query key factory `keys.products.list(params)` etc.
- Tests with `msw` (dev dep) for a success and an error.
- Learn / explain: why validate responses at runtime; query keys as cache identity; stale-while-revalidate.
- Commit: `feat(web): add typed api client and query setup`

## Step 4.6 — guard-rails for later projects
- `components/Seo.tsx` (`title`, `description`, `canonical`, `noindex`) using `react-helmet-async`
  or a tiny `useEffect`-based document head helper (prefer own helper — no dep).
- `lib/track.ts`: `track(event: AnalyticsEvent, payload)` typed union, logs in dev, no-op in prod.
- `data-testid` convention documented in a comment at top of `lib/test-ids.ts` (constants, not strings).
- Commit: `feat(web): add seo head helper and analytics hook stub`

## Step 4.7 — app shell pages
- `NotFound`, `ErrorPage`, `Loading` fallback, and a placeholder `Home` that renders the layout.
  Vite env `VITE_API_URL` for prod (dev uses proxy). `.env.example` updated.
- Playwright installed (`e2e/`), first smoke test: home renders header and footer.
- Commit: `feat(web): add shell pages and playwright smoke test`

Phase 4 done when: the empty shell is responsive, keyboard navigable, Lighthouse a11y ≥ 95, and the
API client round-trips `/health` with schema validation.
