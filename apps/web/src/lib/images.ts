// Every product image is stored twice: 1200 px (`name-1.webp`) and a 600 px twin
// (`name-1-600.webp`), made by `pnpm images:process`. Cards are never wider than ~600 device
// pixels, so offering both through srcset lets a phone download the small file instead of the big.
export function image600(url: string): string {
  return url.replace(/\.webp$/, '-600.webp');
}

export function productSrcSet(url: string): string {
  return `${image600(url)} 600w, ${url} 1200w`;
}
