import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  AllergenSchema,
  DEPARTMENTS,
  DietarySchema,
  NetUnitSchema,
  NutritionSchema,
} from '@store/shared';
import { z } from 'zod';

import { slugify } from '../../lib/slug.ts';

import type { BrandSeed } from './brands.ts';
import type { CategorySeed } from './categories.ts';
import type { ProductSeed } from './expand.ts';

// The catalogue lives in docs/plan/data/catalogue.json (8 brands, 10 departments, 120 products with
// English and German text, food information and the fields later phases use). This module reads it
// once, checks its shape, and turns it into the seed's own types, so the JSON stays the one source
// of truth and a typo in it fails the seed with the product named.
const CATALOGUE_FILE = fileURLToPath(
  new URL('../../../../../docs/plan/data/catalogue.json', import.meta.url),
);

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const CatalogueSchema = z.object({
  brands: z.array(z.object({ slug, name: z.string(), blurb: z.string() })),
  departments: z.array(
    z.object({
      slug,
      name: z.string(),
      nameDe: z.string(),
      subcategories: z.array(z.object({ slug, name: z.string(), nameDe: z.string() })),
    }),
  ),
  products: z.array(
    z.object({
      slug,
      name: z.string(),
      nameDe: z.string(),
      brand: slug.nullable(),
      department: slug,
      subcategory: slug,
      description: z.string(),
      descriptionDe: z.string(),
      priceCents: z.number().int(),
      // 'piece' is a count (6 rolls): it has no net weight, so no unit price.
      net: z.object({ amount: z.number().int().positive(), unit: z.enum(['g', 'ml', 'piece']) }),
      soldByWeight: z.boolean(),
      shelfLifeDays: z.number().int().min(0),
      deposit: z.boolean(),
      food: z.boolean(),
      nutrition: NutritionSchema.nullable(),
      ingredients: z.string().nullable(),
      allergens: z.array(AllergenSchema),
      dietary: z.array(DietarySchema),
      look: z.string(),
      variantOf: slug.nullable(),
    }),
  ),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

export const catalogue: Catalogue = CatalogueSchema.parse(
  JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8')),
);

// German URLs: umlauts become ae/oe/ue and ß becomes ss, as a German reader would write them.
export const slugifyDe = (text: string): string =>
  slugify(text.replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue').replace(/ß/g, 'ss'));

export const HOUSE_BRAND = 'grocery-basics';

// ---------- departments ----------

// The accent of each department (the `--dept-accent` value in tokens.css) is stored on the
// category as well, so the admin and any other client can read it.
const DEPARTMENT_TEXT: Record<
  string,
  { accent: string; description: string; descriptionDe: string }
> = {
  'fruit-veg': {
    accent: '#a3e635',
    description: 'Fresh fruit, vegetables and herbs, picked for the week ahead.',
    descriptionDe: 'Frisches Obst, Gemüse und Kräuter für die Woche.',
  },
  bakery: {
    accent: '#fbbf24',
    description: 'Bread, rolls and pastries from the neighbourhood bakery.',
    descriptionDe: 'Brot, Brötchen und Gebäck aus der Bäckerei um die Ecke.',
  },
  'dairy-eggs': {
    accent: '#7dd3fc',
    description: 'Milk, yoghurt, cheese, eggs and butter from farms around Berlin.',
    descriptionDe: 'Milch, Joghurt, Käse, Eier und Butter von Höfen rund um Berlin.',
  },
  'meat-fish': {
    accent: '#fb7185',
    description: 'Fresh meat, sausage and fish from regional and coastal suppliers.',
    descriptionDe: 'Frisches Fleisch, Wurst und Fisch von regionalen und Küstenlieferanten.',
  },
  pantry: {
    accent: '#fb923c',
    description: 'Pasta, rice, tins, baking basics and breakfast staples.',
    descriptionDe: 'Nudeln, Reis, Konserven, Backzutaten und Frühstücksklassiker.',
  },
  frozen: {
    accent: '#22d3ee',
    description: 'Frozen vegetables, ready meals and ice cream.',
    descriptionDe: 'Tiefkühlgemüse, Fertiggerichte und Eis.',
  },
  drinks: {
    accent: '#2dd4bf',
    description: 'Water, juice, soft drinks, coffee and tea.',
    descriptionDe: 'Wasser, Saft, Softdrinks, Kaffee und Tee.',
  },
  'snacks-sweets': {
    accent: '#f472b6',
    description: 'Crisps, nuts, chocolate and biscuits for the sofa.',
    descriptionDe: 'Chips, Nüsse, Schokolade und Kekse fürs Sofa.',
  },
  household: {
    accent: '#818cf8',
    description: 'Cleaning, paper goods, laundry and dishwashing.',
    descriptionDe: 'Reinigung, Papierwaren, Wäsche und Geschirrspülen.',
  },
  'personal-care-baby': {
    accent: '#c084fc',
    description: 'Body care, dental care and everything for babies.',
    descriptionDe: 'Körperpflege, Zahnpflege und alles für Babys.',
  },
};

const DEPARTMENT_ICON = Object.fromEntries(DEPARTMENTS.map((d) => [d.slug, d.icon]));

export const departmentSeeds: CategorySeed[] = catalogue.departments.map((d) => ({
  slug: d.slug,
  name: d.name,
  description: DEPARTMENT_TEXT[d.slug]?.description ?? d.name,
  attributes: {
    accentColor: DEPARTMENT_TEXT[d.slug]?.accent ?? '#22c55e',
    icon: DEPARTMENT_ICON[d.slug] ?? 'apple',
  },
  children: d.subcategories.map((s) => ({
    slug: s.slug,
    name: s.name,
    description: `${s.name}, at your door in 30 minutes.`,
  })),
}));

// ---------- brands ----------

const BRAND_TEXT: Record<
  string,
  { tagline: string; taglineDe: string; storyDe: string; accent: string }
> = {
  meadowbrook: {
    tagline: 'Milk, yoghurt and butter from Brandenburg farms.',
    taglineDe: 'Milch, Joghurt und Butter von Höfen in Brandenburg.',
    storyDe:
      'Ein kleines Molkereilabel für Milch, Joghurt, Quark und Butter von Höfen in Brandenburg.',
    accent: '#0284c7',
  },
  ofenfrisch: {
    tagline: 'Baked every morning, round the corner.',
    taglineDe: 'Jeden Morgen frisch gebacken, gleich um die Ecke.',
    storyDe: 'Eine Nachbarschaftsbäckerei, die jeden Morgen Brot, Brötchen und Kuchen backt.',
    accent: '#d97706',
  },
  'greenfield-organic': {
    tagline: 'Certified organic, everyday prices.',
    taglineDe: 'Zertifiziert bio, zu Alltagspreisen.',
    storyDe: 'Zertifiziertes Bio-Obst, -Gemüse und Vorratsklassiker.',
    accent: '#15803d',
  },
  'grocery-basics': {
    tagline: 'Plain packs, low prices.',
    taglineDe: 'Schlichte Packung, kleiner Preis.',
    storyDe: 'Die Hausmarke: schlichte Verpackung, Alltagsprodukte zu kleinen Preisen.',
    accent: '#0f7a3d',
  },
  cleanwell: {
    tagline: 'Clean homes, no fuss.',
    taglineDe: 'Saubere Wohnung, ohne Umstände.',
    storyDe: 'Reinigung, Papierwaren und Körperpflege für jeden Tag.',
    accent: '#4f46e5',
  },
  quellwerk: {
    tagline: 'Water and juice in returnable bottles.',
    taglineDe: 'Wasser und Saft in Mehrwegflaschen.',
    storyDe: 'Mineralwasser, Säfte und Softdrinks in Mehrwegflaschen.',
    accent: '#0d9488',
  },
  nordkueste: {
    tagline: 'Fresh from regional and coastal suppliers.',
    taglineDe: 'Frisch von regionalen Lieferanten und von der Küste.',
    storyDe:
      'Frisches Fleisch, frischer Fisch und Tiefkühlkost von regionalen Lieferanten und von der Küste.',
    accent: '#be123c',
  },
  'little-sprout': {
    tagline: 'Gentle essentials for little ones.',
    taglineDe: 'Sanfte Basics für die Kleinen.',
    storyDe: 'Sanfte Nahrung und Pflegeprodukte für Babys und Kleinkinder.',
    accent: '#9333ea',
  },
};

export const brandSeeds: BrandSeed[] = catalogue.brands.map((b) => ({
  slug: b.slug,
  name: b.name,
  tagline: BRAND_TEXT[b.slug]?.tagline ?? b.blurb.slice(0, 100),
  story: b.blurb,
  accentColor: BRAND_TEXT[b.slug]?.accent ?? '#0f7a3d',
}));

// ---------- editorial overlay: what the JSON does not say ----------

// Short "shop by need" tags (a facet on the product list).
export const tagSeeds = [
  { slug: 'breakfast', name: 'Breakfast' },
  { slug: 'quick-dinner', name: 'Quick dinner' },
  { slug: 'baking', name: 'Baking' },
  { slug: 'party', name: 'Party snacks' },
  { slug: 'lunchbox', name: 'Lunchbox' },
  { slug: 'cleaning-day', name: 'Cleaning day' },
];

const TAGS: Record<string, string[]> = {
  breakfast: [
    'broetchen-6',
    'butter-croissants-4',
    'rolled-oats-500g',
    'strawberry-jam',
    'peanut-butter',
    'free-range-eggs-10',
    'natural-yoghurt-500g',
    'whole-milk-1l',
    'orange-juice-1l',
    'bananas',
    'strawberries',
    'coffee-beans-500g',
    'wholemeal-toast',
    'butter-250g',
  ],
  'quick-dinner': [
    'spaghetti-500g',
    'spaetzle-500g',
    'chopped-tomatoes',
    'frozen-pizza-margherita',
    'frozen-fish-fingers',
    'frozen-fries',
    'frozen-stir-fry-veg',
    'bratwurst-6',
    'pork-schnitzel',
    'basmati-rice-1kg',
    'chickpeas-tin',
    'mozzarella',
  ],
  baking: [
    'wheat-flour-1kg',
    'sugar-1kg',
    'butter-250g',
    'free-range-eggs-10',
    'whipping-cream',
    'mixed-nuts',
    'dark-chocolate-70',
    'lemons',
  ],
  party: [
    'paprika-crisps',
    'salted-peanuts',
    'pretzel-sticks',
    'fruit-gummies',
    'cola-1-5l',
    'lemonade-1l',
    'laugenbrezel-4',
    'ice-lollies-8',
  ],
  lunchbox: [
    'wholemeal-toast',
    'cream-cheese',
    'cucumber',
    'apples',
    'oat-cookies',
    'strawberry-yoghurt',
    'turkey-slices',
    'baby-fruit-pouches-4',
  ],
  'cleaning-day': [
    'all-purpose-cleaner',
    'glass-cleaner',
    'bathroom-cleaner',
    'kitchen-sponges-6',
    'bin-bags-20',
    'kitchen-roll-4',
    'dish-soap-500ml',
  ],
};

export const collectionSeedData = {
  'christmas-baking': [
    'wheat-flour-1kg',
    'sugar-1kg',
    'butter-250g',
    'whipping-cream',
    'mixed-nuts',
    'dark-chocolate-70',
    'lebkuchen',
    'apple-strudel',
    'marble-cake',
    'lemons',
  ],
  'bbq-season': [
    'bratwurst-6',
    'chicken-drumsticks',
    'minced-beef',
    'baguette',
    'tomatoes',
    'cucumber',
    'potatoes',
    'cola-1-5l',
    'paprika-crisps',
    'ice-lollies-8',
  ],
  'weekday-lunch': [
    'wholemeal-toast',
    'cream-cheese',
    'turkey-slices',
    'cucumber',
    'apples',
    'natural-yoghurt-500g',
    'oat-cookies',
    'spaghetti-500g',
  ],
} as Record<string, string[]>;

// A strike-through price on these (an Omnibus-style reference price is kept by the pricing engine).
const ON_SALE = new Set([
  'strawberries',
  'salmon-fillet',
  'olive-oil-500ml',
  'coffee-beans-500g',
  'vanilla-ice-cream',
  'mixed-nuts',
  'laundry-liquid-1-5l',
  'nappies-size-4',
  'butter-croissants-4',
  'frozen-prawns',
]);
// Editorial "Bestseller" flag; the badge is otherwise derived from the (seeded) sales.
const BESTSELLERS = new Set([
  'bananas',
  'whole-milk-1l',
  'free-range-eggs-10',
  'spaghetti-500g',
  'rye-sourdough-loaf',
  'still-water-1-5l',
  'butter-croissants-4',
  'tomatoes',
]);
const NEW_PRODUCTS = new Set([
  'high-protein-skyr',
  'lebkuchen',
  'strawberry-sorbet',
  'baby-oat-porridge',
  'spelt-rolls-4',
  'frozen-mixed-berries',
]);

// Where fresh produce, fish and a few staples come from (a facet on the product list).
const ORIGIN: Record<string, string> = {
  bananas: 'Ecuador',
  apples: 'Germany',
  lemons: 'Spain',
  strawberries: 'Spain',
  tomatoes: 'Netherlands',
  cucumber: 'Spain',
  'organic-carrots': 'Germany',
  potatoes: 'Germany',
  mushrooms: 'Germany',
  'organic-baby-spinach': 'Germany',
  'butterhead-lettuce': 'Germany',
  'fresh-basil': 'Italy',
  'salmon-fillet': 'Norway',
  'cod-fillets': 'Iceland',
  'smoked-trout': 'Germany',
  'matjes-herring': 'Netherlands',
  'olive-oil-500ml': 'Italy',
  'basmati-rice-1kg': 'India',
};

const STORAGE: Record<string, 'chilled' | 'frozen'> = {
  'dairy-eggs': 'chilled',
  'meat-fish': 'chilled',
  frozen: 'frozen',
};

// Free samples: the product gets a second, limited option (one per customer) holding a small
// amount of the same thing, so a shopper can try before buying a full pack.
const SAMPLES: Record<string, number> = {
  'ground-coffee-500g': 20,
  'strawberry-jam': 30,
  'peanut-butter': 30,
  'dark-chocolate-70': 20,
  'rolled-oats-500g': 30,
  'high-protein-skyr': 50,
};

// SKU tail: the slug in capitals, so it is readable in an order ("GR-BANANAS").
const skuCode = (s: string) => s.toUpperCase();

function sampleAxis(p: Catalogue['products'][number]): ProductSeed['axes'] {
  const grams = SAMPLES[p.slug];
  if (grams === undefined || p.net.unit === 'piece') return [];
  return [
    {
      key: 'pack',
      values: [
        { value: 'full', label: 'Full size', netAmount: p.net.amount },
        {
          value: 'trial',
          label: `Free sample, ${grams} ${p.net.unit}`,
          isTrial: true,
          absolutePriceCents: 0,
          netAmount: grams,
        },
      ],
    },
  ];
}

const productToSeed = (p: Catalogue['products'][number]): ProductSeed => {
  const sized = p.net.unit === 'piece' ? undefined : p.net;
  const grams =
    p.net.unit === 'piece' ? Math.min(5000, Math.max(100, p.net.amount * 60)) : p.net.amount;
  return {
    slug: p.slug,
    name: p.name,
    nameDe: p.nameDe,
    code: skuCode(p.slug),
    categorySlug: p.subcategory,
    department: p.department,
    description: p.description,
    descriptionDe: p.descriptionDe,
    look: p.look,
    basePriceCents: p.priceCents,
    baseWeightGrams: grams,
    axes: sampleAxis(p),
    ...(ON_SALE.has(p.slug) && { onSale: true }),
    ...(p.brand && { brand: p.brand }),
    tags: Object.entries(TAGS)
      .filter(([, slugs]) => slugs.includes(p.slug))
      .map(([tag]) => tag)
      .slice(0, 4),
    collections: Object.entries(collectionSeedData)
      .filter(([, slugs]) => slugs.includes(p.slug))
      .map(([c]) => c),
    eco: p.dietary.includes('organic'),
    ...(BESTSELLERS.has(p.slug) && { bestseller: true }),
    ...(NEW_PRODUCTS.has(p.slug) && { isNew: true }),
    ...(sized && { netUnit: NetUnitSchema.parse(sized.unit), net: sized.amount }),
    soldByWeight: p.soldByWeight,
    shelfLifeDays: p.shelfLifeDays,
    deposit: p.deposit,
    ...(p.food && { storage: STORAGE[p.department] ?? ('ambient' as const) }),
    ...(ORIGIN[p.slug] && { origin: ORIGIN[p.slug]! }),
    nutrition: p.nutrition,
    ingredients: p.ingredients,
    allergens: p.allergens,
    dietary: p.dietary,
  };
};

export const productSeeds: ProductSeed[] = catalogue.products.map(productToSeed);

// ---------- German text, for the translations seed ----------

export const deText = {
  products: Object.fromEntries(
    catalogue.products.map((p) => [
      p.slug,
      { name: p.nameDe, description: p.descriptionDe, slug: slugifyDe(p.nameDe) },
    ]),
  ),
  categories: Object.fromEntries(
    catalogue.departments.flatMap((d) => [
      [
        d.slug,
        {
          name: d.nameDe,
          description: DEPARTMENT_TEXT[d.slug]?.descriptionDe ?? d.nameDe,
          slug: slugifyDe(d.nameDe),
        },
      ],
      ...d.subcategories.map((s) => [
        s.slug,
        {
          name: s.nameDe,
          description: `${s.nameDe}, in 30 Minuten vor deiner Tür.`,
          slug: slugifyDe(s.nameDe),
        },
      ]),
    ]),
  ) as Record<string, { name: string; description: string; slug: string }>,
  brands: Object.fromEntries(
    catalogue.brands.map((b) => [
      b.slug,
      {
        name: b.name,
        tagline: BRAND_TEXT[b.slug]?.taglineDe ?? '',
        story: BRAND_TEXT[b.slug]?.storyDe ?? '',
        slug: b.slug,
      },
    ]),
  ),
};
