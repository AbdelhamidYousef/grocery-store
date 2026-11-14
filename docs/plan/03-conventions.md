# Plan 03: Conventions

Grocery keeps the engine conventions of Pawsome (see `docs/pawsome-plan/03-conventions.md`: working
rhythm, gates, code style, testing rules, commit style). This file only holds what is new here.

## Tone of voice

Plain, warm, short. The shop says what happens and when, like a good courier would.

- **Say what happens and when.** "Arrives 14:00–15:00", "We will email you when it ships". Not
  "Your journey to freshness begins".
- **Short.** One idea per sentence; a label is one to three words; no sentence over about 20 words.
- **Warm, not cute.** Friendly verbs ("we make it right"), no puns, no mascots, no pet words
  ("happy tails") left over from Pawsome.
- **No exclamation marks in system text** (errors, confirmations, emails, banners). One may appear
  in a marketing line, never in a message about money, stock or delivery.
- **Honest about problems.** Say what went wrong and what the shopper can do. No "Oops".
- **German uses "du"** ("Dein Warenkorb ist sicher"), never "Sie". Same short, plain style; do not
  translate English sentence by sentence.
- **Numbers and times are exact:** "30 minutes", "49 euros", 24-hour clock, the shop's own units.
- **Brand name** is always "Grocery" with a capital G; in a sentence "we" is enough.

Tagline: "Groceries at your door in 30 minutes." / "Lebensmittel in 30 Minuten an deiner Tür."

German catalogue content in the seed (`translations/de.json`: product and guide texts) still says "Sie"
in places; it is replaced with the grocery catalogue in G3.
