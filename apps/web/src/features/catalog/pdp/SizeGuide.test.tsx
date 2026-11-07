import type { SizeGuide } from '@store/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeVariant } from '../../../test/fixtures';

import { parseHowTo, rowForVariant, SizeGuideButton } from './SizeGuide';

const guide: SizeGuide = {
  slug: 'harness',
  title: 'Harness sizes',
  columns: ['Chest (cm)', 'Weight (kg)'],
  rows: [
    { size: 'S', label: 'Small', values: ['40 to 55', 'up to 8'] },
    { size: 'M', label: 'Medium', values: ['55 to 70', '8 to 20'] },
    { size: 'L', label: 'Large', values: ['70 to 95', '20 to 40'] },
  ],
  howtoMd: '1. Measure the chest.\n2. Add two fingers of room.\nNote: use a soft tape.',
  tip: 'In between sizes? Size up.',
};
const medium = makeVariant({ options: { color: 'red', size: 'M' } });

describe('parseHowTo', () => {
  it('turns numbered lines into steps and keeps other lines as notes', () => {
    expect(parseHowTo('1. One\n2) Two\n\n  3.  Three  \nPlain line')).toEqual({
      steps: ['One', 'Two', 'Three'],
      notes: ['Plain line'],
    });
    expect(parseHowTo('')).toEqual({ steps: [], notes: [] });
  });
});

describe('rowForVariant', () => {
  it('finds the row by any of the variant options, and none for a size not in the guide', () => {
    expect(rowForVariant(guide, medium)?.label).toBe('Medium');
    expect(rowForVariant(guide, makeVariant({ options: { size: 'XL' } }))).toBeUndefined();
    expect(rowForVariant(guide, undefined)).toBeUndefined();
  });
});

describe('SizeGuideButton', () => {
  it('opens a labelled dialog with the table, highlighting the selected size', async () => {
    render(<SizeGuideButton guide={guide} variant={medium} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Size guide' }));
    const dialog = screen.getByRole('dialog', { name: 'Harness sizes' });
    const rows = within(dialog).getAllByRole('row');
    // Header + three sizes; only the Medium row is marked.
    expect(rows).toHaveLength(4);
    expect(within(dialog).getByRole('columnheader', { name: 'Chest (cm)' })).toBeInTheDocument();
    const marked = rows.filter((r) => r.hasAttribute('data-selected'));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('Medium');
    expect(marked[0]).toHaveTextContent('(your size)');
    expect(marked[0]).toHaveTextContent('55 to 70');
  });

  it('shows the tip, the steps as an ordered list and decorative figures with captions', async () => {
    render(<SizeGuideButton guide={guide} variant={medium} />);
    await userEvent.click(screen.getByRole('button', { name: 'Size guide' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('size-guide-tip')).toHaveTextContent(
      'In between sizes? Size up.',
    );
    const steps = within(dialog)
      .getAllByRole('listitem')
      .filter((li) => li.closest('ol'));
    expect(steps.map((s) => s.textContent)).toEqual([
      'Measure the chest.',
      'Add two fingers of room.',
    ]);
    expect(within(dialog).getByText('Note: use a soft tape.')).toBeInTheDocument();
    for (const caption of ['Neck', 'Chest', 'Length']) {
      expect(within(dialog).getByText(caption)).toBeInTheDocument();
    }
    expect(dialog.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });

  it('leaves out the tip and the how-to when the guide has none', async () => {
    render(<SizeGuideButton guide={{ ...guide, tip: null, howtoMd: '' }} variant={medium} />);
    await userEvent.click(screen.getByRole('button', { name: 'Size guide' }));
    expect(screen.queryByTestId('size-guide-tip')).toBeNull();
    expect(screen.queryByText('How to measure')).toBeNull();
  });

  it('highlights nothing when the variant has no size in the guide', async () => {
    render(<SizeGuideButton guide={guide} variant={makeVariant({ options: { size: 'XL' } })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Size guide' }));
    expect(screen.queryByText('(your size)')).toBeNull();
  });

  it('closes with the Close button (the native dialog returns focus to the opener)', async () => {
    render(<SizeGuideButton guide={guide} variant={medium} />);
    await userEvent.click(screen.getByRole('button', { name: 'Size guide' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
