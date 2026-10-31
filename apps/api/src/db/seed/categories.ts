import type { CategoryAttributes } from '../schema/categories.ts';

export type CategorySeed = {
  slug: string;
  name: string;
  description: string;
  attributes?: CategoryAttributes;
  children: { slug: string; name: string; description: string }[];
};

// Each pet has its own accent colour; the UI themes the whole shop section with it.
export const categories: CategorySeed[] = [
  {
    slug: 'dogs',
    name: 'Dogs',
    description: 'Toys, beds, treats and walkies gear for dogs of every size.',
    attributes: { accentColor: '#F59E0B', icon: 'dog' },
    children: [
      { slug: 'dog-toys', name: 'Toys', description: 'Tug, fetch and chew toys.' },
      { slug: 'dog-beds', name: 'Beds & Housing', description: 'Soft places to curl up.' },
      {
        slug: 'dog-treats',
        name: 'Food & Treats',
        description: 'Training bites and crunchy biscuits.',
      },
      {
        slug: 'dog-bowls',
        name: 'Bowls & Feeders',
        description: 'Bowls that last and slow feeders.',
      },
      {
        slug: 'dog-walk',
        name: 'Walk & Travel',
        description: 'Collars and leashes for every walk.',
      },
    ],
  },
  {
    slug: 'cats',
    name: 'Cats',
    description: 'Playthings, cosy corners and snacks for curious cats.',
    attributes: { accentColor: '#8B5CF6', icon: 'cat' },
    children: [
      { slug: 'cat-toys', name: 'Toys', description: 'Teasers, kickers and crinkly mice.' },
      { slug: 'cat-beds', name: 'Beds & Housing', description: 'Caves, perches and cushions.' },
      {
        slug: 'cat-treats',
        name: 'Food & Treats',
        description: 'Crunchy treats and lickable pouches.',
      },
      {
        slug: 'cat-bowls',
        name: 'Bowls & Feeders',
        description: 'Whisker-friendly bowls and water dispensers.',
      },
      {
        slug: 'cat-travel',
        name: 'Walk & Travel',
        description: 'Carriers for vet trips and holidays.',
      },
    ],
  },
  {
    slug: 'birds',
    name: 'Birds',
    description: 'Perches, play and fresh food for feathered friends.',
    attributes: { accentColor: '#14B8A6', icon: 'bird' },
    children: [
      { slug: 'bird-toys', name: 'Toys', description: 'Swings, bells and mirrors.' },
      { slug: 'bird-food', name: 'Food & Treats', description: 'Seed blends and millet treats.' },
      { slug: 'bird-cages', name: 'Cages & Stands', description: 'Travel cages and play stands.' },
      {
        slug: 'bird-feeders',
        name: 'Bowls & Feeders',
        description: 'Hanging and tabletop feeders.',
      },
    ],
  },
  {
    slug: 'fish',
    name: 'Fish',
    description: 'Tanks, food and decor for a happy aquarium.',
    attributes: { accentColor: '#0EA5E9', icon: 'fish' },
    children: [
      { slug: 'fish-food', name: 'Food & Treats', description: 'Flakes and pellets.' },
      {
        slug: 'fish-tanks',
        name: 'Tanks & Decor',
        description: 'Tanks, lights, plants and hideouts.',
      },
    ],
  },
  {
    slug: 'small-pets',
    name: 'Small Pets',
    description: 'Hay, hideaways and chews for rabbits, guinea pigs and friends.',
    attributes: { accentColor: '#84CC16', icon: 'rabbit' },
    children: [
      { slug: 'small-toys', name: 'Toys', description: 'Tunnels and chews.' },
      { slug: 'small-food', name: 'Food & Treats', description: 'Hay and crunchy chews.' },
      { slug: 'small-housing', name: 'Beds & Housing', description: 'Hideaway houses.' },
      { slug: 'small-bowls', name: 'Bowls & Feeders', description: 'Bowls and water bottles.' },
    ],
  },
];
