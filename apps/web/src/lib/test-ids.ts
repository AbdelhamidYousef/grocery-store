// data-testid convention
// ----------------------
// Tests (Playwright now, any later A/B or analytics tooling) find elements by `data-testid`, never
// by CSS class or visible text, because classes are styling and text is copy: both change for
// reasons unrelated to behaviour. Rules:
//  - the id names WHAT the element is, not how it looks: `product-card`, not `blue-box`;
//  - kebab-case, one constant per id in this file, used as `data-testid={TEST_IDS.productCard}`;
//  - repeated items share one id (`product-card`) and tests pick one by role/name/index;
//  - ids stay stable when markup is restyled. Renaming one is a breaking change to the e2e suite.
// Ids already in the shell (header, footer, search-input, ...) are spelled inline in the layout
// components; new features add theirs here.
export const TEST_IDS = {
  pageHome: 'page-home',
  pageCategory: 'page-category',
  pageSearch: 'page-search',
  pageProduct: 'page-product',
  productGrid: 'product-grid',
  productCard: 'product-card',
  productCardName: 'product-card-name',
  soldOutBadge: 'sold-out-badge',
  resultCount: 'result-count',
  pagination: 'pagination',
  emptyState: 'empty-state',
  clearFilters: 'clear-filters',
  filters: 'filters',
  filtersToggle: 'filters-toggle',
  filterGroup: 'filter-group',
  filterOption: 'filter-option',
  filterChips: 'filter-chips',
  filterChip: 'filter-chip',
  sortSelect: 'sort-select',
  gallery: 'gallery',
  galleryMain: 'gallery-main',
  galleryThumb: 'gallery-thumb',
  variantPicker: 'variant-picker',
  variantOption: 'variant-option',
  quantity: 'quantity',
  addToCart: 'add-to-cart',
  stockHint: 'stock-hint',
  productAttributes: 'product-attributes',
} as const;

export type TestId = (typeof TEST_IDS)[keyof typeof TEST_IDS];
