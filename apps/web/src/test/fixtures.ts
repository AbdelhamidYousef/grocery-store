import type {
  Navigation,
  Address,
  AdminCollection,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProduct,
  AdminProductRow,
  AdminStats,
  AdminVariant,
  Brand,
  CategoryNode,
  Collection,
  AdminReturnDetail,
  CustomerOrder,
  CustomerReturn,
  OrderReturns,
  Facets,
  GuideCard,
  GuideDetail,
  HeroSlide,
  HomeResponse,
  Order,
  OrderSummary,
  PointsSummary,
  ProductCard,
  ProductDetail,
  ProductListResponse,
  Review,
  ReviewListResponse,
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
    sale: null,
    hasMemberPrice: false,
    member: null,
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
    safetyNotices: [],
    specs: [],
    faqs: [],
    feedingTable: [],
    sizeGuide: null,
    deliveryNote: null,
    bundle: null,
    kits: [],
    rating: { count: 0, averageTenths: 0 },
    requiresVetApproval: false,
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
export function makeCart(
  items: WebCartItem[] = [],
  warnings: WebCart['warnings'] = [],
  requiresVetApproval = false,
): WebCart {
  const buyable = items.filter((i) => i.available > 0);
  return {
    items,
    currency: 'EUR',
    subtotalCents: buyable.reduce((n, i) => n + i.lineTotalCents, 0),
    itemCount: buyable.reduce((n, i) => n + i.quantity, 0),
    weightGrams: 0,
    warnings,
    pricing: makeCartPricing(),
    requiresVetApproval,
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
    slug: 'choosing-a-dog-toy',
    title: 'How to choose a dog toy',
    summary: 'Tug, fetch or chew.',
    coverUrl: null,
    category: { slug: 'dogs', name: 'Dogs' },
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
    bodyMd: 'Dogs play in **different** ways.\n\n## What to look for\n\n- Start small',
    products: [makeCard()],
    related: [makeGuideCard({ slug: 'first-week-with-a-puppy', title: 'First week' })],
    ...overrides,
  };
}

export function makeHero(over: Partial<HeroSlide> = {}): HeroSlide {
  return {
    title: 'Happy tails start here',
    text: 'Colourful, tough supplies for every pet.',
    ctaLabel: 'Shop dogs',
    ctaHref: '/c/dogs',
    imageUrl: null,
    ...over,
  };
}

export function makeHome(over: Partial<HomeResponse> = {}): HomeResponse {
  return {
    heroSlides: [
      makeHero(),
      makeHero({ title: 'Purr-fect playtime', ctaLabel: 'Shop cats', ctaHref: '/c/cats' }),
      makeHero({
        title: 'Little pets, big love',
        ctaLabel: 'Shop small',
        ctaHref: '/c/small-pets',
      }),
    ],
    promoTile: null,
    bestsellers: [makeCard(), makeCard({ id: 'p2', slug: 'ball', name: 'Ball' })],
    ...over,
  };
}

export function makeNavigation(): Navigation {
  const brands = [
    { slug: 'burrow-and-biscuit', name: 'Burrow & Biscuit' },
    { slug: 'pawsome', name: 'Pawsome' },
  ];
  return {
    pets: [
      {
        pet: 'dog',
        name: 'Dogs',
        categorySlug: 'dogs',
        categories: [
          { slug: 'dog-toys', name: 'Toys', productCount: 20 },
          { slug: 'dog-beds', name: 'Beds & Housing', productCount: 9 },
        ],
        brands,
        promo: {
          title: 'Walkies, sorted',
          subtitle: 'Leads and more.',
          imageUrl: '/products/dog-toys/braided-tug-rope-1.webp',
          imageAlt: 'A lead',
          link: '/c/dog-walk',
        },
      },
      {
        pet: 'cat',
        name: 'Cats',
        categorySlug: 'cats',
        categories: [
          { slug: 'cat-scratch', name: 'Scratch posts', productCount: 4 },
          { slug: 'cat-toys', name: 'Toys', productCount: 11 },
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
    petAgeMonths: 30,
    petWeightG: 11_500,
    sizePurchased: 'M',
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
