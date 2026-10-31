import type {
  Address,
  CategoryNode,
  Facets,
  ProductCard,
  ProductDetail,
  ProductListResponse,
  User,
  Variant,
} from '@store/shared';

// Valid-by-construction API payloads for tests. Every factory takes overrides so a test states
// only what it cares about.

export function makeCard(overrides: Partial<ProductCard> = {}): ProductCard {
  return {
    id: 'p1',
    slug: 'rope-tug',
    name: 'Rope Tug',
    categorySlug: 'dog-toys',
    image: {
      id: 'i1',
      url: '/products/dog-toys/rope-tug-1.webp',
      alt: 'A braided rope tug toy',
      width: 1200,
      height: 1200,
      variantId: null,
    },
    price: { minCents: 1099, maxCents: 1899, currency: 'EUR' },
    inStock: true,
    attributes: { pet: 'dog', material: 'cotton rope', brand: 'Pawsome', ageStage: 'all' },
    ...overrides,
  };
}

export function makeFacets(overrides: Partial<Facets> = {}): Facets {
  return {
    attributes: {
      pet: [{ value: 'dog', count: 2 }],
      material: [
        { value: 'cotton rope', count: 1 },
        { value: 'natural rubber', count: 1 },
      ],
      brand: [{ value: 'Pawsome', count: 2 }],
      ageStage: [{ value: 'all', count: 2 }],
    },
    price: { min: 799, max: 1899 },
    ...overrides,
  };
}

export function makeList(
  cards: ProductCard[],
  extra: { total?: number; page?: number; limit?: number; facets?: Facets } = {},
): ProductListResponse {
  const limit = extra.limit ?? 24;
  const total = extra.total ?? cards.length;
  return {
    data: cards,
    meta: {
      page: extra.page ?? 1,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    facets: extra.facets ?? makeFacets(),
  };
}

export function makeCategory(overrides: Partial<CategoryNode> = {}): CategoryNode {
  return {
    id: 'c1',
    slug: 'dogs',
    name: 'Dogs',
    description: 'Toys, beds, treats and walkies gear for dogs of every size.',
    parentId: null,
    sortOrder: 0,
    accentColor: '#F59E0B',
    icon: 'dog',
    productCount: 10,
    children: [],
    ...overrides,
  };
}

export function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'v1',
    sku: 'PW-TUG-RED-S',
    name: 'Red · Small',
    options: { color: 'red', size: 'S' },
    priceCents: 1099,
    compareAtPriceCents: null,
    currency: 'EUR',
    isDefault: false,
    available: true,
    lowStock: false,
    ...overrides,
  };
}

export function makeProduct(overrides: Partial<ProductDetail> = {}): ProductDetail {
  const variants = [
    makeVariant({
      id: 'v1',
      sku: 'TUG-RED-S',
      options: { color: 'red', size: 'S' },
      isDefault: true,
    }),
    makeVariant({
      id: 'v2',
      sku: 'TUG-RED-L',
      options: { color: 'red', size: 'L' },
      priceCents: 1899,
    }),
    makeVariant({ id: 'v3', sku: 'TUG-BLUE-S', options: { color: 'blue', size: 'S' } }),
  ];
  return {
    id: 'p1',
    slug: 'rope-tug',
    name: 'Rope Tug',
    description: 'A sturdy braided tug for happy games.',
    category: { slug: 'dog-toys', name: 'Toys' },
    breadcrumb: [
      { slug: 'dogs', name: 'Dogs' },
      { slug: 'dog-toys', name: 'Toys' },
    ],
    attributes: { pet: 'dog', material: 'cotton rope', brand: 'Pawsome', ageStage: 'all' },
    optionKeys: ['color', 'size'],
    price: { minCents: 1099, maxCents: 1899, currency: 'EUR' },
    inStock: true,
    variants,
    images: [
      {
        id: 'i1',
        url: '/products/dog-toys/rope-tug-1.webp',
        alt: 'Rope tug, front',
        width: 1200,
        height: 1200,
        variantId: null,
      },
      {
        id: 'i2',
        url: '/products/dog-toys/rope-tug-2.webp',
        alt: 'Rope tug, in use',
        width: 1200,
        height: 1200,
        variantId: null,
      },
    ],
    ...overrides,
  };
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'sam@example.com',
    firstName: 'Sam',
    lastName: 'Rivers',
    role: 'customer',
    ...overrides,
  };
}

export function makeAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 'a1',
    label: 'Home',
    fullName: 'Sam Rivers',
    line1: '1 Bone Street',
    line2: null,
    city: 'Berlin',
    region: null,
    postalCode: '10115',
    country: 'DE',
    phone: null,
    isDefaultShipping: true,
    isDefaultBilling: true,
    ...overrides,
  };
}
