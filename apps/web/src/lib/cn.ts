// Joins class names, skipping falsy values. Enough for conditional classes without a dependency.
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
