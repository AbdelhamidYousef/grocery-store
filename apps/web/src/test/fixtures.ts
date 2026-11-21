import {
  dateKeyIn,
  type DeliveryArea,
  type DeliverySlot,
  type SlotDay,
  type SlotsResponse,
  type PostcodeLookup,
  type Navigation,
  type Address,
  type AdminCollection,
  type AdminOrderDetail,
  type AdminOrderRow,
  type AdminProduct,
  type AdminProductRow,
  type AdminStats,
  type AdminVariant,
  type Brand,
  type CategoryNode,
  type Collection,
  type AdminReturnDetail,
  type CustomerOrder,
  type CustomerReturn,
  type OrderReturns,
  type Facets,
  type GuideCard,
  type GuideDetail,
  type HeroSlide,
  type HomeResponse,
  type Order,
  type OrderSummary,
  type PointsSummary,
  type ProductCard,
  type ProductDetail,
  type ProductListResponse,
  type Review,
  type ReviewListResponse,
  type ShippingQuote,
  type User,
  type Variant,
} from '@store/shared';

import type { WebCart, WebCartItem } from '../api/cart';

// Valid-by-construction API payloads for tests. Every factory takes overrides so a test states
// only what it cares about.

export function makeCard(overrides: Partial<ProductCard> = {}): ProductCard {
  return {
    id: 'p1',
    slug: 'rope-tug',
    name: 'Rope Tug',
    categorySlug: 'cheese',
    departmentSlug: 'dairy-eggs',
    image: {
      id: 'i1',
      url: '/products/cheese/rope-tug-1.webp',
      alt: 'A braided rope tug toy',
      width: 1200,
      height: 1200,
      variantId: null,
    },
    price: { minCents: 1099, maxCents: 1899, currency: 'EUR' },
    inStock: true,
    attributes: { storage: 'chilled', origin: 'spain' },
    brand: null,
    badges: [],
    unitPrice: null,
    swatches: [],
    weighedGrams: null,
    sale: null,
    hasMemberPrice: false,
    member: null,
    rating: { count: 0, averageTenths: 0 },
    ...overrides,
  };
}

export function makeFacets(overrides: Partial<Facets> = {}): Facets {
  return {
    attributes: {
      storage: [{ value: 'chilled', count: 2 }],
      origin: [
        { value: 'spain', count: 1 },
        { value: 'germany', count: 1 },
      ],
    },
    brand: [],
    tag: [],
    diet: [],
    badge: [],
    price: { min: 799, max: 1899 },
    ...overrides,
  };
}

export function makeList(
  cards: ProductCard[],
  extra: {
    total?: number;
    page?: number;
    limit?: number;
    facets?: Facets;
    chips?: ProductListResponse['chips'];
  } = {},
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
    chips: extra.chips ?? [],
  };
}

export function makeCategory(overrides: Partial<CategoryNode> = {}): CategoryNode {
  return {
    id: 'c1',
    slug: 'dairy-eggs',
    name: 'Dairy & eggs',
    description: 'Milk, cheese, yoghurt and eggs.',
    parentId: null,
    sortOrder: 0,
    departmentSlug: 'dairy-eggs',
    accentColor: '#F59E0B',
    icon: 'milk',
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
    sale: null,
    hasMemberPrice: false,
    member: null,
    weight: null,
    bestBefore: null,
    shortDated: null,
    constituents: [],
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
    category: { slug: 'cheese', name: 'Toys' },
    breadcrumb: [
      { slug: 'dairy-eggs', name: 'Dairy & eggs' },
      { slug: 'cheese', name: 'Toys' },
    ],
    departmentSlug: 'dairy-eggs',
    attributes: { storage: 'chilled', origin: 'spain' },
    food: null,
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
        url: '/products/cheese/rope-tug-1.webp',
        alt: 'Rope tug, front',
        width: 1200,
        height: 1200,
        variantId: null,
      },
      {
        id: 'i2',
        url: '/products/cheese/rope-tug-2.webp',
        alt: 'Rope tug, in use',
        width: 1200,
        height: 1200,
        variantId: null,
      },
    ],
    safetyNotices: [],
    specs: [],
    faqs: [],
    deliveryNote: null,
    bundle: null,
    kits: [],
    rating: { count: 0, averageTenths: 0 },
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
    imageUrl: '/products/cheese/rope-tug-1.webp',
    imageAlt: 'A braided rope tug toy',
    unitPriceCents: 1099,
    quantity: 1,
    lineTotalCents: 1099,
    available: 10,
    maxQty: 10,
    weight: null,
    shortDated: false,
    bestBefore: null,
    substitution: 'best_match',
    substitute: null,
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
    pricing: makeCartPricing(),
    delivery: null,
  };
}

export function makeCartPricing(overrides: Partial<WebCart['pricing']> = {}): WebCart['pricing'] {
  return {
    code: null,
    lines: [],
    adjustments: [],
    discountCents: 0,
    merchandiseCents: 0,
    shippingEstimateCents: 0,
    totalEstimateCents: 0,
    gift: null,
    progress: { freeShipping: null, gift: null, nextTier: null },
    notices: [],
    ...overrides,
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
      donationCents: 0,
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
    authorizedCents: null,
    capturedCents: null,
    refundedCents: 0,
    items: [
      {
        id: 'oi1',
        productName: 'Rope Tug',
        variantName: 'Small',
        sku: 'PW-ROPE-S',
        imageUrl: '/products/cheese/rope-tug-1.webp',
        unitPriceCents: 1099,
        quantity: 2,
        lineTotalCents: 2198,
        pricePerKgCents: null,
        weighedGrams: null,
        finalCents: null,
        shortDated: false,
        pickStatus: 'pending' as const,
        pickedQty: null,
        substitutesItemId: null,
        swapStatus: null,
        listPriceCents: null,
        refundedCents: 0,
      },
    ],
    delivery: null,
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
    thumbnails: ['/products/cheese/rope-tug-1.webp'],
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
    lowStockByStore: [
      { storeSlug: 'mitte', storeName: 'Grocery Mitte', count: 2 },
      { storeSlug: 'neukoelln', storeName: 'Grocery Neukölln', count: 0 },
    ],
    ...overrides,
  };
}

export const MITTE_STORE_ID = 'b0000000-0000-4000-8000-000000000001';
export const CATEGORY_UUID = '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10';

export function makeAdminRow(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return {
    id: 'p1',
    slug: 'rope-tug',
    name: 'Rope Tug',
    status: 'active',
    categoryName: 'Cheese',
    variantCount: 3,
    minPriceCents: 1099,
    maxPriceCents: 1899,
    currency: 'EUR',
    availableStock: 12,
    imageUrl: '/products/cheese/rope-tug-1.webp',
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
    memberPriceCents: null,
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
    stores: [
      {
        storeId: MITTE_STORE_ID,
        storeSlug: 'mitte',
        storeName: 'Grocery Mitte',
        quantity: 10,
        reserved: 2,
        available: 8,
        lowStockThreshold: 3,
      },
    ],
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
    category: { id: CATEGORY_UUID, slug: 'cheese', name: 'Cheese' },
    attributes: {
      storage: 'chilled',
      origin: 'spain',
      optionKeys: ['Colour', 'Size'],
    },
    brandId: null,
    isEco: false,
    isBestsellerOverride: false,
    badgeNewUntil: null,
    nutrition: null,
    ingredients: null,
    allergens: [],
    dietary: [],
    tags: [],
    variants: [
      makeAdminVariant(),
      makeAdminVariant({ id: 'v2', sku: 'TUG-RED-L', name: 'Red, large', isDefault: false }),
    ],
    images: [
      {
        id: 'i1',
        url: '/products/cheese/rope-tug-1.webp',
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
        donationCents: 0,
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
      authorizedCents: null,
      capturedCents: null,
      refundedCents: 0,
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
          pricePerKgCents: null,
          weighedGrams: null,
          finalCents: null,
          shortDated: false,
          pickStatus: 'pending' as const,
          pickedQty: null,
          substitutesItemId: null,
          swapStatus: null,
          listPriceCents: null,
          refundedCents: 0,
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
          pricePerKgCents: null,
          weighedGrams: null,
          finalCents: null,
          shortDated: false,
          pickStatus: 'pending' as const,
          pickedQty: null,
          substitutesItemId: null,
          swapStatus: null,
          listPriceCents: null,
          refundedCents: 0,
        },
      ],
      delivery: null,
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
    promotions: [],
    allowedNext: ['processing', 'cancelled'],
    ...overrides,
  };
}

export function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 'b1',
    slug: 'scaleby',
    name: 'Scaleby',
    tagline: 'Habitat gear that gets the climate right.',
    story: 'Scaleby builds terrariums and heat gear for keepers who care about the climate.',
    accentColor: '#16A34A',
    logoUrl: null,
    productCount: 12,
    ...overrides,
  };
}

export function makeGuideCard(overrides: Partial<GuideCard> = {}): GuideCard {
  return {
    slug: 'tomato-pasta-in-fifteen-minutes',
    title: 'Tomato pasta in 15 minutes',
    summary: 'Tug, fetch or chew.',
    coverUrl: null,
    category: { slug: 'recipes', name: 'Recipes' },
    publishedAt: '2026-03-04T00:00:00.000Z',
    readingMinutes: 3,
    ...overrides,
  };
}

export function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col1',
    slug: 'halloween',
    name: 'Halloween',
    description: 'Spooky toys and pumpkin treats.',
    accentColor: '#EA580C',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2026-11-03T00:00:00.000Z',
    productCount: 4,
    ...overrides,
  };
}

export function makeAdminCollection(overrides: Partial<AdminCollection> = {}): AdminCollection {
  return {
    ...makeCollection(),
    isActive: true,
    sortOrder: 0,
    isLive: true,
    productIds: ['p1', 'p2'],
    products: [
      { id: 'p1', name: 'Pumpkin Ball', slug: 'pumpkin-ball' },
      { id: 'p2', name: 'Bat Teaser', slug: 'bat-teaser' },
    ],
    ...overrides,
  };
}

export function makeGuideDetail(overrides: Partial<GuideDetail> = {}): GuideDetail {
  return {
    ...makeGuideCard(),
    bodyMd: 'Leaves wilt in **different** ways.\n\n## What to look for\n\n- Start small',
    products: [makeCard()],
    related: [makeGuideCard({ slug: 'keep-herbs-and-salad-fresh', title: 'Keep herbs fresh' })],
    ...overrides,
  };
}

export function makeHero(over: Partial<HeroSlide> = {}): HeroSlide {
  return {
    title: 'Fresh fruit and veg, today',
    text: 'Berries, tomatoes and herbs, at your door in 30 minutes.',
    ctaLabel: 'Shop fruit & veg',
    ctaHref: '/c/fruit-veg',
    imageUrl: null,
    ...over,
  };
}

export function makeHome(over: Partial<HomeResponse> = {}): HomeResponse {
  return {
    heroSlides: [
      makeHero(),
      makeHero({ title: 'Baked this morning', ctaLabel: 'Shop bakery', ctaHref: '/c/bakery' }),
      makeHero({
        title: 'Dinner in ten minutes',
        ctaLabel: 'Shop frozen',
        ctaHref: '/c/frozen',
      }),
    ],
    promoTile: null,
    bestsellers: [makeCard(), makeCard({ id: 'p2', slug: 'ball', name: 'Ball' })],
    ...over,
  };
}

export function makeNavigation(): Navigation {
  const brands = [
    { slug: 'meadowbrook', name: 'Meadowbrook Dairy' },
    { slug: 'grocery-basics', name: 'Grocery Basics' },
  ];
  return {
    departments: [
      {
        slug: 'dairy-eggs',
        name: 'Dairy & eggs',
        categories: [
          { slug: 'milk-cream', name: 'Milk & cream', productCount: 3 },
          { slug: 'cheese', name: 'Cheese', productCount: 3 },
        ],
        brands,
        promo: {
          title: 'From farms near Berlin',
          subtitle: 'Milk, yoghurt and eggs.',
          imageUrl: '/products/placeholders/dairy-eggs.svg',
          imageAlt: 'A milk bottle',
          link: '/brands/meadowbrook',
        },
      },
      {
        slug: 'bakery',
        name: 'Bakery',
        categories: [
          { slug: 'bread', name: 'Bread', productCount: 4 },
          { slug: 'rolls-pretzels', name: 'Rolls & pretzels', productCount: 4 },
        ],
        brands,
        promo: null,
      },
    ],
  };
}

export function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    rating: 5,
    title: 'Tough rope',
    body: 'My beagle has not managed to destroy it yet, and it has been a month.',
    verifiedBuyer: true,
    authorName: 'Ada L.',
    wouldRecommend: true,
    helpfulCount: 2,
    votedHelpful: false,
    photos: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeReviewList(
  reviews: Review[] = [],
  summary: Partial<ReviewListResponse['summary']> = {},
): ReviewListResponse {
  return {
    data: reviews,
    meta: { page: 1, limit: 10, total: reviews.length, totalPages: reviews.length ? 1 : 0 },
    summary: {
      rating: { count: reviews.length, averageTenths: reviews.length ? 46 : 0 },
      breakdown: reviews.length ? [0, 0, 1, 2, 7] : [0, 0, 0, 0, 0],
      recommendPercent: reviews.length ? 92 : null,
      topics: [],
      uploadsEnabled: true,
      ...summary,
    },
  };
}
export function makePoints(overrides: Partial<PointsSummary> = {}): PointsSummary {
  return {
    balance: 0,
    lifetimeEarned: 0,
    tier: { id: 'pup', label: 'Pup', ratePercent: 100 },
    nextTier: { id: 'good_dog', label: 'Good Dog', pointsNeeded: 500 },
    entries: [],
    ...overrides,
  };
}

export function makeReturn(overrides: Partial<CustomerReturn> = {}): CustomerReturn {
  return {
    id: 'ret1',
    orderNumber: 'PW-2026-000123',
    status: 'requested',
    reason: 'wrong_size',
    note: null,
    rejectReason: null,
    refundCents: 1099,
    refundShipping: false,
    simulated: false,
    items: [
      {
        id: 'ri1',
        orderItemId: 'oi1',
        productName: 'Rope Tug',
        variantName: 'Small',
        imageUrl: null,
        quantity: 1,
        reason: 'wrong_size',
        refundCents: 1099,
      },
    ],
    createdAt: '2026-11-05T10:00:00.000Z',
    approvedAt: null,
    receivedAt: null,
    refundedAt: null,
    ...overrides,
  };
}

export function makeOrderReturns(overrides: Partial<OrderReturns> = {}): OrderReturns {
  return {
    returns: [],
    eligibility: {
      eligible: true,
      reason: null,
      deadline: '2026-12-04T10:00:00.000Z',
      lines: [{ orderItemId: 'oi1', returnableQuantity: 2, paidCents: 1099 }],
    },
    ...overrides,
  };
}

export function makeAdminReturnDetail(
  overrides: Partial<AdminReturnDetail> = {},
  ret: Partial<CustomerReturn> = {},
): AdminReturnDetail {
  const r = makeReturn(ret);
  return {
    return: r,
    email: 'sam@example.test',
    currency: 'EUR',
    orderTotalCents: 2689,
    shippingCents: 490,
    shippingRefundable: true,
    restockItemIds: r.items.filter((i) => i.reason !== 'damaged').map((i) => i.id),
    allowedNext: ['approved', 'rejected'],
    simulatedMode: false,
    ...overrides,
  };
}

// Postcodes the tests treat as served (the default msw answer): 10115 Mitte, 12043 and 12045 Neukölln.
export const SERVED_POSTCODES: Record<string, { area: string; areaSlug: string; store: string }> = {
  '10115': { area: 'Mitte', areaSlug: 'mitte', store: 'Grocery Mitte' },
  '12043': { area: 'Neukölln', areaSlug: 'neukoelln', store: 'Grocery Neukölln' },
  '12045': { area: 'Neukölln', areaSlug: 'neukoelln', store: 'Grocery Neukölln' },
};

export function makePostcodeLookup(code: string): PostcodeLookup {
  const hit = SERVED_POSTCODES[code];
  return hit
    ? {
        postcode: code,
        served: true,
        area: { slug: hit.areaSlug, name: hit.area },
        store: { slug: hit.areaSlug, name: hit.store },
      }
    : { postcode: code, served: false };
}

export function makeDeliveryAreas(): DeliveryArea[] {
  return [
    {
      slug: 'mitte',
      name: 'Mitte',
      store: {
        slug: 'mitte',
        name: 'Grocery Mitte',
        street: 'Brunnenstraße 14',
        postalCode: '10119',
      },
      postcodes: ['10115', '10117'],
    },
    {
      slug: 'neukoelln',
      name: 'Neukölln',
      store: {
        slug: 'neukoelln',
        name: 'Grocery Neukölln',
        street: 'Sonnenallee 95',
        postalCode: '12045',
      },
      postcodes: ['12043', '12045'],
    },
  ];
}

// ---------- delivery slots (G5) ----------

const SLOT_MIN = 60_000;

/**
 * `GET /delivery/slots` for tests: today's slots relative to the real clock (one closed, one full, two
 * open) grouped by the shop's day, plus one slot tomorrow, like the API does. `express` is the
 * answer for the express card.
 */
export function makeSlotsData(
  overrides: Partial<SlotsResponse['data']> = {},
  now = new Date(),
): SlotsResponse['data'] {
  const slot = (
    id: string,
    inMinutes: number,
    status: DeliverySlot['status'],
    remaining: number,
  ): DeliverySlot => {
    const startsAt = new Date(now.getTime() + inMinutes * SLOT_MIN);
    return {
      id,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * SLOT_MIN).toISOString(),
      remaining,
      status,
    };
  };
  const all = [
    slot('11111111-1111-4111-8111-111111111111', 20, 'closed', 5),
    slot('22222222-2222-4222-8222-222222222222', 180, 'full', 0),
    slot('33333333-3333-4333-8333-333333333333', 300, 'open', 5),
    slot('44444444-4444-4444-8444-444444444444', 420, 'open', 2),
    slot('55555555-5555-4555-8555-555555555555', 24 * 60 + 180, 'open', 8),
  ];
  const days: SlotDay[] = [];
  for (const s of all) {
    const date = dateKeyIn(new Date(s.startsAt));
    const last = days[days.length - 1];
    if (last?.date === date) last.slots.push(s);
    else days.push({ date, slots: [s] });
  }
  return {
    serverNow: now.toISOString(),
    days,
    express: { available: false, reason: 'closed' },
    ...overrides,
  };
}

/** A cart delivery holding the given slot of `makeSlotsData` for 15 minutes. */
export function makeHeldDelivery(
  slotId = '33333333-3333-4333-8333-333333333333',
  now = new Date(),
): NonNullable<WebCart['delivery']> {
  const slot = makeSlotsData({}, now)
    .days.flatMap((d) => d.slots)
    .find((s) => s.id === slotId)!;
  return {
    kind: 'slot',
    slot: { id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt },
    holdExpiresAt: new Date(now.getTime() + 15 * SLOT_MIN).toISOString(),
  };
}
