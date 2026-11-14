# Phase G2: Brand and theme

Goal: the shell looks and reads like **Grocery**, a bright quick-delivery shop in Berlin: two store
views, a fresh palette, a plain wordmark, a tagline and a tone of voice. The catalogue, departments
and the quick-commerce home layout come in G3 (they need the new categories).

Brand (decided on the owner's behalf, logged REVIEW):
- Palette: fresh green primary `#0f7a3d` (hover `#0b6331`, strong `#0a5a2c`, bright `#22c55e`, soft
  `#e3f5e9`), ink `#13221a`, muted `#4f5f55`, background `#f6faf5`, border `#d9e6dc`, citrus accent
  `#facc15` (soft `#fef9c3`, text on it is ink) for "30 min" and deal badges. White on the primary is
  above 4.5:1 (AA for body text).
- Type: display **Plus Jakarta Sans** (variable, `@fontsource-variable`), body stays Nunito Sans.
- Mark: a hand-made SVG (a rounded shopping bag with a leaf), next to the word "Grocery" set in the
  display font. SVG, not an AI image: crisp at 16 px, themeable, no quota.
- Tagline: "Groceries at your door in 30 minutes." (de: "Lebensmittel in 30 Minuten an deiner Tür.")
- Tone: plain, warm, short. Say what happens and when ("Arrives 14:00–15:00"). No puns, no
  exclamation marks in system text, "du" in German.

## Step G2.1: two store views, Berlin only
- `STORES`: `de-en` (English, `en-DE`) and `de-de` (German), both EUR, shipping to DE only. Remove
  `eu-en`, `fr-fr`, `uk-en`, the French dictionaries (web and email), `en-gb`, GBP prices in seed,
  admin and tests. Old prefixes redirect to `de-en`.
- Learn / explain: why removing a language early saves work in every later phase.
- Commit: `refactor(i18n): keep two store views, English and German, in EUR`

## Step G2.2: palette and type
- `tokens.css` with the palette above; Plus Jakarta Sans for display. Leave the per-pet accent
  variables for G3 (they go with the pet axis). Check contrast of primary/ink/muted on bg/surface.
- Commit: `feat(web): grocery palette and display font`

## Step G2.3: mark, wordmark and brand name
- `Logo` component (SVG mark + wordmark), favicon SVG + PNG sizes, web manifest, `<title>`/SEO,
  email sender name and email header, `Pawsome` → `Grocery` in shell strings, tagline in header/footer
  and SEO description. Demo accounts' `@pawsome.test` emails → `@grocery.test`.
- Commit: `feat(web): Grocery mark, wordmark and tagline`

## Step G2.4: tone of voice and shell copy
- Short "Tone of voice" section in `docs/plan/03-conventions.md`; rewrite the shell copy (header,
  footer, trust bar, 404/error pages, newsletter, cookie banner, email boilerplate) to it, en + de.
- Commit: `docs(brand): tone of voice, and shell copy rewritten to it`

## Step G2.5: phase end
- Gates + e2e; journal, quiz, handover. Commit: `docs(plan): phase G2 done`
