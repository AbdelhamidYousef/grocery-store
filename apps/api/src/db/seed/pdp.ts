import type { ProductSeed } from './expand.ts';

// Structured product-page content for the demo catalogue (phase 16). Everything is made up and
// generated from the product's category and slug, so the data stays small and re-seeding gives
// the same rows every time. All figures are fictional guidance, never veterinary advice.

export interface PdpSeed {
  specs: { label: string; value: string }[];
  faqs: { question: string; answer: string }[];
  /** Basis points per key (kcal is plain kcal per 100 g); same for every variant of the product. */
  constituents: Record<'protein' | 'fat' | 'fibre' | 'ash' | 'moisture' | 'kcal', number> | null;
  deliveryNote: string | null;
}

// FNV-1a, integer only: a stable pseudo-random number per slug, so values differ between products
// but never between seed runs.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
const between = (seed: number, min: number, max: number) => min + (seed % (max - min + 1));

const FED_CATEGORIES = new Set([
  'dog-treats',
  'cat-treats',
  'small-food',
  'bird-food',
  'fish-food',
  'reptile-food',
]);
function constituentsFor(p: ProductSeed): PdpSeed['constituents'] {
  if (!FED_CATEGORIES.has(p.categorySlug)) return null;
  const h = hash(p.slug);
  return {
    protein: between(h >>> 3, 1800, 3400),
    fat: between(h >>> 7, 800, 2000),
    fibre: between(h >>> 11, 200, 500),
    ash: between(h >>> 13, 600, 900),
    moisture: between(h >>> 17, 800, 1200),
    kcal: between(h >>> 5, 280, 420),
  };
}

const CARE: Record<string, string> = {
  'dog-toys': 'Wipe clean or hand wash. Supervise play and replace when worn.',
  'cat-toys': 'Wipe clean. Supervise play and replace when worn.',
  'dog-beds': 'Machine washable at 30 degrees, cover removable.',
  'cat-beds': 'Machine washable at 30 degrees, cover removable.',
  'dog-bowls': 'Dishwasher safe.',
  'cat-bowls': 'Dishwasher safe.',
  'dog-walk': 'Wipe clean with a damp cloth. Check for wear before every walk.',
};

function specsFor(p: ProductSeed): PdpSeed['specs'] {
  const specs: PdpSeed['specs'] = [
    { label: 'Material', value: p.material },
    { label: 'Suitable for', value: p.pet === 'small' ? 'Small pets' : p.pet },
    { label: 'Life stage', value: p.ageStage === 'all' ? 'All life stages' : p.ageStage },
  ];
  if (FED_CATEGORIES.has(p.categorySlug)) {
    specs.push({ label: 'Storage', value: 'Keep cool and dry, reseal after opening.' });
    specs.push({ label: 'Best before', value: 'Printed on the pack, at least 6 months' });
  } else if (CARE[p.categorySlug]) {
    specs.push({ label: 'Care', value: CARE[p.categorySlug] ?? '' });
  }
  specs.push({ label: 'Made in', value: 'Pawsome Workshop (a made-up place)' });
  return specs;
}

function faqsFor(p: ProductSeed): PdpSeed['faqs'] {
  if (FED_CATEGORIES.has(p.categorySlug)) {
    return [
      {
        question: 'How should I store it after opening?',
        answer: 'Close the pack tightly and keep it somewhere cool and dry. Use within 8 weeks.',
      },
      {
        question: 'Can it replace a regular meal?',
        answer:
          'No. It is a complementary product: cut the main meal a little on days you give more.',
      },
      {
        question: 'What if my pet is not eating it?',
        answer:
          'Try a trial size first. If your pet still refuses it, contact us and we will help.',
      },
    ];
  }
  if (p.categorySlug.endsWith('-beds')) {
    return [
      {
        question: 'Can I wash it?',
        answer: 'Yes. Remove the cover and machine wash at 30 degrees, then air dry.',
      },
    ];
  }
  return [
    {
      question: 'Is it safe to leave with my pet unsupervised?',
      answer: 'We recommend supervising play and checking the item for wear regularly.',
    },
    {
      question: 'What is the return policy?',
      answer: 'Unused items can be returned within 30 days. See the Delivery & returns tab.',
    },
  ];
}

function deliveryNoteFor(p: ProductSeed): string | null {
  if (p.categorySlug.endsWith('-beds')) {
    return 'Beds ship in their own box and can arrive separately from the rest of your order.';
  }
  if (p.categorySlug.endsWith('-bowls') && /ceramic/.test(p.slug)) {
    return 'Ceramic goods are packed with extra padding, so the box is a little larger.';
  }
  return null;
}

export function pdpFor(p: ProductSeed): PdpSeed {
  return {
    specs: specsFor(p),
    faqs: faqsFor(p),
    constituents: constituentsFor(p),
    deliveryNote: deliveryNoteFor(p),
  };
}
