import type { ProductSeed } from './expand.ts';

// Structured product-page content for the demo catalogue (specs and FAQs), generated from each
// product's own data so it stays small and a re-seed gives the same rows every time. Everything is
// made up.

export interface PdpSeed {
  specs: { label: string; value: string }[];
  faqs: { question: string; answer: string }[];
  deliveryNote: string | null;
}

const netText = (p: ProductSeed): string | null =>
  p.net && p.netUnit ? `${p.net} ${p.netUnit}` : null;

const shelfLifeText = (days: number): string =>
  days === 1 ? 'Best eaten within a day' : `Keeps about ${days} days from delivery`;

const STORAGE_TEXT = {
  ambient: 'Store in a cool, dry place',
  chilled: 'Keep chilled at 2 to 7 °C',
  frozen: 'Keep frozen at -18 °C or colder',
} as const;

function specsFor(p: ProductSeed): PdpSeed['specs'] {
  const specs: PdpSeed['specs'] = [];
  const net = netText(p);
  if (net) specs.push({ label: 'Net contents', value: net });
  if (p.storage) specs.push({ label: 'Storage', value: STORAGE_TEXT[p.storage] });
  if (p.nutrition !== null && p.shelfLifeDays > 0) {
    specs.push({ label: 'Shelf life', value: shelfLifeText(p.shelfLifeDays) });
  }
  if (p.deposit) specs.push({ label: 'Deposit', value: 'Returnable bottle, with a deposit' });
  if (p.soldByWeight) specs.push({ label: 'Sold by', value: 'Weight: the pack size is a guide' });
  if (specs.length === 0) specs.push({ label: 'Brand', value: p.brand ?? 'Grocery' });
  return specs;
}

const FRESH_DEPARTMENTS = new Set(['fruit-veg', 'bakery', 'dairy-eggs', 'meat-fish']);

function faqsFor(p: ProductSeed): PdpSeed['faqs'] {
  if (FRESH_DEPARTMENTS.has(p.department)) {
    return [
      {
        question: 'How fresh will it be?',
        answer:
          'We pick it on the day you order. The shelf life on this page counts from delivery.',
      },
      {
        question: 'What if something is not right?',
        answer: 'Tell us within 24 hours with a photo and we will refund it or send a new one.',
      },
    ];
  }
  if (p.nutrition !== null) {
    return [
      {
        question: 'Where can I find the allergen information?',
        answer: 'In the Nutrition & ingredients tab. Allergens are in bold in the ingredients.',
      },
    ];
  }
  return [
    {
      question: 'Can I return it?',
      answer: 'Unopened items can be returned within 30 days. See the Delivery & returns tab.',
    },
  ];
}

function deliveryNoteFor(p: ProductSeed): string | null {
  if (p.storage === 'frozen') return 'Frozen goods arrive in an insulated bag with ice packs.';
  if (p.storage === 'chilled') return 'Chilled goods arrive in a cool bag.';
  return null;
}

export function pdpFor(p: ProductSeed): PdpSeed {
  return { specs: specsFor(p), faqs: faqsFor(p), deliveryNote: deliveryNoteFor(p) };
}
