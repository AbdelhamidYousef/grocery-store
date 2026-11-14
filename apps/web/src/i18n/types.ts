// A dictionary entry is a plain string or a set of plural forms. `{name}` marks a value that is
// filled in at runtime; there is no markup in a string (bold text or a link is a component around
// `t()`, so a translator never sees or breaks HTML).
export interface PluralForms {
  /** Used for a count of exactly 0 when a language wants different words there ("No items"). */
  zero?: string;
  one: string;
  other: string;
}
export type Entry = string | PluralForms;
export type Dictionary = Record<string, Entry>;
export type Params = Record<string, string | number>;
