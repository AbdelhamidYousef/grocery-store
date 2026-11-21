import type { Dictionary } from '../types';

export const pdp = {
  // ---- product page ----
  'pdp.page.home': 'Home',
  'pdp.page.loadError.seoTitle': 'Something went wrong',
  'pdp.page.loadError.title': 'We could not load this product',
  'pdp.page.loadError.retry': 'Try again',
  'pdp.page.loading': 'Loading product',
  'pdp.page.reviewCount': { one: '{count} review', other: '{count} reviews' },
  'pdp.page.soldOut': 'Sold out',
  'pdp.page.inStock': 'In stock',
  'pdp.page.sku': 'SKU {sku}',
  'pdp.page.trialSize': 'Trial size',
  'pdp.page.trialNote':
    'A sample to try before you commit: one per customer. The full size has no limit.',
  'pdp.page.attr.storage': 'Storage',
  'pdp.page.attr.origin': 'Origin',
  'pdp.page.attr.size': 'Size',
  'pdp.page.attr.brand': 'Brand',
  'pdp.page.attr.goodFor': 'Good for',

  // ---- tabs ----
  'pdp.tabs.label': 'Product information',
  'pdp.tabs.description': 'Description',
  'pdp.tabs.specs': 'Specs',
  'pdp.tabs.delivery': 'Delivery & returns',

  // ---- specs ----
  'pdp.tabs.nutrition': 'Nutrition & ingredients',
  'pdp.food.nutritionHeading': 'Nutrition information',
  'pdp.food.typicalValues': 'Typical values',
  'pdp.food.per100g': 'per 100 g',
  'pdp.food.per100ml': 'per 100 ml',
  'pdp.food.energy': 'Energy',
  'pdp.food.energyValue': '{kj} kJ / {kcal} kcal',
  'pdp.food.grams': '{value} g',
  'pdp.food.fat': 'Fat',
  'pdp.food.saturates': 'of which saturates',
  'pdp.food.carbs': 'Carbohydrate',
  'pdp.food.sugars': 'of which sugars',
  'pdp.food.fibre': 'Fibre',
  'pdp.food.protein': 'Protein',
  'pdp.food.salt': 'Salt',
  'pdp.food.ingredientsHeading': 'Ingredients',
  'pdp.food.ingredientsNote': 'Allergens are in bold.',
  'pdp.food.noIngredients': 'The ingredients are not listed for this product.',
  'pdp.food.allergensHeading': 'Allergens',
  'pdp.food.contains': 'Contains:',
  'pdp.food.noAllergens': 'No allergens declared.',

  'pdp.specs.heading': 'Specifications',
  'pdp.specs.analysis': 'Guaranteed analysis',
  'pdp.specs.per100': 'Per 100 g.',
  'pdp.specs.per100Variant': 'Per 100 g, {variant}.',
  'pdp.specs.constituent.protein': 'Protein',
  'pdp.specs.constituent.fat': 'Fat',
  'pdp.specs.constituent.fibre': 'Fibre',
  'pdp.specs.constituent.ash': 'Ash',
  'pdp.specs.constituent.moisture': 'Moisture',
  'pdp.specs.constituent.kcal': 'Energy',
  'pdp.specs.kcal': '{value} kcal',
  'pdp.specs.percent': '{value} %',

  // ---- FAQ ----
  'pdp.faq.heading': 'Questions and answers',

  // ---- delivery panel ----
  'pdp.delivery.heading': 'Delivery',
  'pdp.delivery.shipIntro':
    'We deliver in one-hour slots from the store that packs your order, or within 30 minutes with express. You pick the time at checkout and see the exact price before you pay. Read the',
  'pdp.delivery.shipLink': 'delivery page',
  'pdp.delivery.shipOutro': 'for prices and times.',
  'pdp.delivery.cutoffNote':
    'A slot can be booked until 60 minutes before it starts. We hold it for 15 minutes while you check out.',
  'pdp.delivery.returnsHeading': 'Returns',
  'pdp.delivery.returnsIntro':
    'Changed your mind? Unused items in their original packaging can be returned within 30 days. Opened food and hygiene items cannot be returned unless they are faulty. See',
  'pdp.delivery.returnsLink': 'returns and withdrawal',

  // ---- bought together ----
  'pdp.bought.heading': 'Frequently bought together',
  'pdp.bought.thisItem': 'This item:',
  'pdp.bought.notAvailable': '(not available)',
  'pdp.bought.withVariant': '{name} ({variant})',
  'pdp.bought.view': 'View',
  'pdp.bought.viewLabel': 'View {name}',
  'pdp.bought.anItem': 'An item',
  'pdp.bought.problem': '{name}: {message}',
  'pdp.bought.total': 'Total',
  'pdp.bought.beforeDiscounts': 'Before any discounts.',
  'pdp.bought.addAll': 'Add all',
  'pdp.bought.addAllCount': {
    one: 'Add all ({count} item)',
    other: 'Add all ({count} items)',
  },

  // ---- bundles and kits ----
  'pdp.bundle.heading': 'What is in the kit',
  'pdp.bundle.qtyLine': '{qty} x {name}',
  'pdp.bundle.saving': 'Save {saving} vs individually ({individual})',
  'pdp.kits.heading': 'Make it a kit',
  'pdp.kits.save': 'Save {saving}',

  // ---- rails ----
  'pdp.related.heading': 'You may also like',
  'pdp.related.label': 'Related products',
  'pdp.recent.heading': 'Recently viewed',
} satisfies Dictionary;
