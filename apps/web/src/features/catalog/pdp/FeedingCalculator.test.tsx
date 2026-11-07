import type { ProductDetail } from '@store/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeProduct, makeVariant } from '../../../test/fixtures';

import { FeedingCalculator } from './FeedingCalculator';

// Bands: 1-5 kg (mid 3) 15 g, 5-10 kg (mid 7.5) 30 g, 10-20 kg (mid 15) 50 g.
const feedingTable = [
  { petWeightGMin: 1000, petWeightGMax: 5000, dailyG: 15, lifeStage: 'any' as const },
  { petWeightGMin: 5000, petWeightGMax: 10000, dailyG: 30, lifeStage: 'any' as const },
  { petWeightGMin: 10000, petWeightGMax: 20000, dailyG: 50, lifeStage: 'any' as const },
];

const small = makeVariant({
  id: 'v-small',
  sku: 'KIB-500',
  name: '500 g bag',
  options: { pack: '500g' },
  priceCents: 600,
  netAmount: 500,
  netUnit: 'g',
  isDefault: true,
});
const big = makeVariant({
  id: 'v-big',
  sku: 'KIB-2000',
  name: '2 kg bag',
  options: { pack: '2kg' },
  priceCents: 1800,
  netAmount: 2000,
  netUnit: 'g',
});
const trial = makeVariant({
  id: 'v-trial',
  sku: 'KIB-TRIAL',
  name: '50 g sample',
  options: { pack: 'trial' },
  priceCents: 149,
  netAmount: 50,
  netUnit: 'g',
  isTrial: true,
});

function setup(
  over: { ageStage?: string; table?: ProductDetail['feedingTable']; selected?: typeof small } = {},
) {
  const product = makeProduct({
    feedingTable: over.table ?? feedingTable,
    attributes: { pet: 'dog', ...(over.ageStage && { ageStage: over.ageStage }) },
    optionKeys: ['pack'],
    variants: [small, big, trial],
  });
  const onPick = vi.fn();
  render(
    <FeedingCalculator product={product} variant={over.selected ?? small} onPickVariant={onPick} />,
  );
  return { onPick };
}

const weight = () => screen.getByLabelText('Pet weight (kg)');

async function typeWeight(text: string) {
  const user = userEvent.setup();
  await user.clear(weight());
  if (text) await user.type(weight(), text);
}

describe('FeedingCalculator', () => {
  it('starts from a mid-table weight and gives the answer as a sentence first', () => {
    setup();
    // Middle band 5-10 kg -> 7.5 kg -> 30 g, two meals of 15 g.
    expect(weight()).toHaveValue('7.5');
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent(
      'About 30 g a day, two meals of 15 g',
    );
  });

  it('follows a typed weight, with the days a bag lasts and the cost per day', async () => {
    setup();
    await typeWeight('5.25');
    // 23 g a day: 500 g lasts 21 days; EUR 6.00 * 23 / 500 = 27.6 cents -> 28.
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent(
      'About 23 g a day, two meals of 12 g',
    );
    expect(screen.getByTestId('feeding-bag')).toHaveTextContent(
      'This bag lasts about 21 days, about €0.28 a day.',
    );
  });

  it('moves the weight with the slider and the number follows', () => {
    setup();
    const slider = screen.getByLabelText('Pet weight slider');
    // jsdom has no keyboard support for ranges, so the change event stands in for an arrow key.
    fireEvent.change(slider, { target: { value: '7600' } });
    expect(weight()).toHaveValue('7.6');
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent('About 30 g a day');
    expect(slider).toHaveAttribute('min', '1000');
    expect(slider).toHaveAttribute('max', '19900');
    expect(slider).toHaveAttribute('step', '100');
  });

  it('says so, and uses the edge, when the weight is outside the table', async () => {
    setup();
    await typeWeight('0.5');
    expect(screen.getByTestId('feeding-clamp')).toHaveTextContent(
      'Our guide starts at 1 kg, so this is the amount for 1 kg',
    );
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent('About 15 g a day');
    await typeWeight('45');
    expect(screen.getByTestId('feeding-clamp')).toHaveTextContent('Our guide stops at 20 kg');
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent('About 50 g a day');
  });

  it('asks for a weight instead of guessing when the box is empty or not a number', async () => {
    setup();
    await typeWeight('');
    expect(screen.getByTestId('feeding-result')).toHaveTextContent('Enter your pet');
    expect(weight()).toHaveAttribute('aria-invalid', 'true');
    await typeWeight('abc');
    expect(screen.getByTestId('feeding-result')).toHaveTextContent('Enter your pet');
    expect(screen.queryByTestId('feeding-daily')).toBeNull();
  });

  it('changes the meals', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Meals a day'), '3');
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent('three meals of 10 g');
    await userEvent.selectOptions(screen.getByLabelText('Meals a day'), '1');
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent('About 30 g a day, one meal');
    expect(screen.getByTestId('feeding-daily')).not.toHaveTextContent('of 30 g');
  });

  it('offers the bag that lasts a month and picks it, never a trial sample', async () => {
    const { onPick } = setup();
    // 30 g a day: 500 g = 16 days -> the 2 kg bag (66 days) is the first to reach 30.
    const button = screen.getByRole('button', { name: 'Pick the bag size that lasts a month' });
    await userEvent.click(button);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'v-big' }));
  });

  it('shows no button when the selected size already lasts a month', () => {
    setup({ selected: big });
    expect(screen.queryByRole('button', { name: /lasts a month/ })).toBeNull();
    expect(screen.getByText('This size already lasts a month or more.')).toBeInTheDocument();
  });

  it('leaves out the bag lines for a variant with no net weight', () => {
    const product = makeProduct({
      feedingTable,
      variants: [makeVariant({ isDefault: true })],
    });
    render(
      <FeedingCalculator product={product} variant={product.variants[0]} onPickVariant={vi.fn()} />,
    );
    expect(screen.getByTestId('feeding-daily')).toBeInTheDocument();
    expect(screen.queryByTestId('feeding-bag')).toBeNull();
  });

  it('prefills the life stage from the product and lets the shopper change it', async () => {
    setup({
      ageStage: 'puppy',
      table: [
        { petWeightGMin: 1000, petWeightGMax: 10000, dailyG: 40, lifeStage: 'puppy' },
        { petWeightGMin: 1000, petWeightGMax: 10000, dailyG: 20, lifeStage: 'adult' },
      ],
    });
    const stage = screen.getByLabelText('Life stage');
    expect(stage).toHaveValue('puppy');
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent('About 40 g a day');
    await userEvent.selectOptions(stage, 'adult');
    expect(screen.getByTestId('feeding-daily')).toHaveTextContent('About 20 g a day');
  });

  it('hides the life stage box when the table has one stage, and states the disclaimer', () => {
    setup();
    expect(screen.queryByLabelText('Life stage')).toBeNull();
    expect(screen.getByText(/not veterinary advice/)).toBeInTheDocument();
  });

  it('draws the cup as decoration only, hidden from assistive technology', () => {
    setup();
    expect(screen.getByTestId('feeding-cup')).toHaveAttribute('aria-hidden', 'true');
  });
});
