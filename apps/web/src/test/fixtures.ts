import type {
  Address,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProduct,
  AdminProductRow,
  AdminStats,
  AdminVariant,
  CategoryNode,
  CustomerOrder,
  Facets,
  Order,
  OrderSummary,
  ProductCard,
  ProductDetail,
  ProductListResponse,
  ShippingQuote,
  User,
  Variant,
} from '@store/shared';

import type { WebCart, WebCartItem } from '../api/cart';

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
    attributes: { pet: 'dog', material: 'cotton rope', ageStage: 'all' },
    brand: null,
    badges: [],
    unitPrice: null,
    swatches: [],
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
      ageStage: [{ value: 'all', count: 2 }],
    },
    brand: [],
    tag: [],
    badge: [],
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
    netAmount: null,
    netUnit: null,
    unitPrice: null,
    isTrial: false,
    swatchHex: null,
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
    attributes: { pet: 'dog', material: 'cotton rope', ageStage: 'all' },
    brand: null,
    tags: [],
    badges: [],
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

export function makeCartItem(overrides: Partial<WebCartItem> = {}): WebCartItem {
  return {
    id: 'l1',
    variantId: 'v1',
    productId: 'p1',
    productName: 'Rope Tug',
    productSlug: 'rope-tug',
    variantName: 'Small',
    sku: 'PW-ROPE-S',
    imageUrl: '/products/dog-toys/rope-tug-1.webp',
    imageAlt: 'A braided rope tug toy',
    unitPriceCents: 1099,
    quantity: 1,
    lineTotalCents: 1099,
    available: 10,
    maxQty: 10,
    ...overrides,
  };
}

// Totals follow the items, like the real API (sold-out lines excluded).
export function makeCart(items: WebCartItem[] = [], warnings: WebCart['warnings'] = []): WebCart {
  const buyable = items.filter((i) => i.available > 0);
  return {
    items,
    currency: 'EUR',
    subtotalCents: buyable.reduce((n, i) => n + i.lineTotalCents, 0),
    itemCount: buyable.reduce((n, i) => n + i.quantity, 0),
    weightGrams: 0,
    warnings,
  };
}

export function makeQuote(overrides: Partial<ShippingQuote> = {}): ShippingQuote {
  return {
    code: 'standard',
    name: 'Standard shipping',
    priceCents: 490,
    free: false,
    freeOverCents: 4900,
    currency: 'EUR',
    etaDaysMin: 3,
    etaDaysMax: 5,
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    number: 'PW-2026-000123',
    status: 'paid',
    paymentStatus: 'succeeded',
    email: 'sam@example.test',
    totals: {
      currency: 'EUR',
      subtotalCents: 2199,
      shippingCents: 490,
      discountCents: 0,
      taxCents: 0,
      totalCents: 2689,
    },
    shippingMethod: { code: 'standard', name: 'Standard shipping' },
    shippingAddress: {
      fullName: 'Sam Rivers',
      line1: '1 Bone Street',
      line2: null,
      city: 'Berlin',
      region: null,
      postalCode: '10115',
      country: 'DE',
      phone: null,
    },
    billingAddress: null,
    notes: null,
    items: [
      {
        id: 'oi1',
        productName: 'Rope Tug',
        variantName: 'Small',
        sku: 'PW-ROPE-S',
        imageUrl: '/products/dog-toys/rope-tug-1.webp',
        unitPriceCents: 1099,
        quantity: 2,
        lineTotalCents: 2198,
      },
    ],
    placedAt: '2026-10-31T10:00:00.000Z',
    createdAt: '2026-10-31T09:59:00.000Z',
    ...overrides,
  };
}

export function makeOrderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    number: 'PW-2026-000123',
    status: 'paid',
    totalCents: 2689,
    currency: 'EUR',
    itemCount: 2,
    thumbnails: ['/products/dog-toys/rope-tug-1.webp'],
    placedAt: '2026-10-31T10:00:00.000Z',
    createdAt: '2026-10-31T09:59:00.000Z',
    ...overrides,
  };
}

export function makeCustomerOrder(overrides: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    ...makeOrder(),
    timeline: [
      { status: 'pending_payment', at: '2026-10-31T09:59:00.000Z' },
      { status: 'paid', at: '2026-10-31T10:00:00.000Z' },
    ],
    ...overrides,
  };
}

export function makeAdminStats(overrides: Partial<AdminStats> = {}): AdminStats {
  return {
    ordersToday: 3,
    revenue30dCents: 123_456,
    currency: 'EUR',
    lowStockCount: 2,
    ...overrides,
  };
}

export const CATEGORY_UUID = '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10';

export function makeAdminRow(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return {
    id: 'p1',
    slug: 'rope-tug',
    name: 'Rope Tug',
    status: 'active',
    categoryName: 'Dog toys',
    variantCount: 3,
    minPriceCents: 1099,
    maxPriceCents: 1899,
    currency: 'EUR',
    availableStock: 12,
    imageUrl: '/products/dog-toys/rope-tug-1.webp',
    updatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  };
}

export function makeAdminVariant(overrides: Partial<AdminVariant> = {}): AdminVariant {
  return {
    id: 'v1',
    productId: 'p1',
    sku: 'TUG-RED-S',
    name: 'Red, small',
    options: { Colour: 'Red', Size: 'S' },
    priceCents: 1099,
    compareAtPriceCents: null,
    currency: 'EUR',
    weightGrams: 250,
    isDefault: true,
    netAmount: null,
    netUnit: null,
    isTrial: false,
    swatchHex: null,
    status: 'active',
    quantity: 10,
    reserved: 2,
    available: 8,
    lowStockThreshold: 3,
    updatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  };
}

export function makeAdminProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 'p1',
    slug: 'rope-tug',
    name: 'Rope Tug',
    description: 'A sturdy braided tug for happy games.',
    status: 'active',
    category: { id: CATEGORY_UUID, slug: 'dog-toys', name: 'Dog toys' },
    attributes: {
      pet: 'dog',
      material: 'cotton rope',
      optionKeys: ['Colour', 'Size'],
    },
    brandId: null,
    isEco: false,
    isBestsellerOverride: false,
    badgeNewUntil: null,
    tags: [],
    variants: [
      makeAdminVariant(),
      makeAdminVariant({ id: 'v2', sku: 'TUG-RED-L', name: 'Red, large', isDefault: false }),
    ],
    images: [
      {
        id: 'i1',
        url: '/products/dog-toys/rope-tug-1.webp',
        alt: 'Rope tug',
        width: 1200,
        height: 1200,
        variantId: null,
        sortOrder: 0,
      },
    ],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  };
}

export function makeAdminOrderRow(overrides: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    number: 'PW-2026-000101',
    status: 'paid',
    email: 'sam@example.com',
    totalCents: 4297,
    currency: 'EUR',
    itemCount: 3,
    paymentStatus: 'succeeded',
    placedAt: '2026-10-30T09:15:00.000Z',
    createdAt: '2026-10-30T09:10:00.000Z',
    ...overrides,
  };
}

export function makeAdminOrderDetail(
  overrides: Partial<AdminOrderDetail> = {},
  status: AdminOrderDetail['order']['status'] = 'paid',
): AdminOrderDetail {
  return {
    order: {
      number: 'PW-2026-000101',
      status,
      paymentStatus: 'succeeded',
      email: 'sam@example.com',
      totals: {
        currency: 'EUR',
        subtotalCents: 3798,
        shippingCents: 499,
        discountCents: 0,
        taxCents: 0,
        totalCents: 4297,
      },
      shippingMethod: { code: 'standard', name: 'Standard' },
      shippingAddress: {
        fullName: 'Sam Rivers',
        line1: '1 Bone Street',
        line2: null,
        city: 'Berlin',
        region: null,
        postalCode: '10115',
        country: 'DE',
        phone: null,
      },
      billingAddress: null,
      notes: null,
      items: [
        {
          id: 'oi1',
          productName: 'Rope Tug',
          variantName: 'Red, small',
          sku: 'TUG-RED-S',
          imageUrl: null,
          unitPriceCents: 1099,
          quantity: 2,
          lineTotalCents: 2198,
        },
        {
          id: 'oi2',
          productName: 'Squeaky Duck',
          variantName: 'Yellow',
          sku: 'DUCK-1',
          imageUrl: null,
          unitPriceCents: 1600,
          quantity: 1,
          lineTotalCents: 1600,
        },
      ],
      placedAt: '2026-10-30T09:15:00.000Z',
      createdAt: '2026-10-30T09:10:00.000Z',
    },
    payment: {
      status: 'succeeded',
      providerPaymentIntentId: 'pi_3Test123',
      amountCents: 4297,
      currency: 'EUR',
      lastError: null,
    },
    customer: { id: 'u1', email: 'sam@example.com', name: 'Sam Rivers' },
    history: [
      {
        fromStatus: null,
        toStatus: 'pending_payment',
        actor: 'system',
        note: null,
        at: '2026-10-30T09:10:00.000Z',
      },
      {
        fromStatus: 'pending_payment',
        toStatus: 'paid',
        actor: 'stripe',
        note: null,
        at: '2026-10-30T09:15:00.000Z',
      },
    ],
    allowedNext: ['processing', 'cancelled'],
    ...overrides,
  };
}
