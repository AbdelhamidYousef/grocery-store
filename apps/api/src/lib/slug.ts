// "Rope Toy (Red) & Co." -> "rope-toy-red-co". Accents are folded first ("Crème" -> "creme") so a
// name with diacritics still gives a readable, ASCII-only URL.
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'product';
}
