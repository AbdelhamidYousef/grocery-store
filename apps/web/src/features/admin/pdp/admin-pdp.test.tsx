import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAdminProduct } from '../../../test/fixtures';
import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

beforeEach(() => {
  server.use(
    signedInAs({ role: 'admin' }),
    http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
    http.get(`${API}/admin/brands`, () => HttpResponse.json({ data: [] })),
    http.get(`${API}/admin/tags`, () => HttpResponse.json({ data: [] })),
  );
});

const content = (over: Record<string, unknown> = {}) => ({
  specs: [{ label: 'Origin', value: 'Nowhere' }],
  faqs: [{ id: 'f1', question: 'Is it washable?', answer: 'Yes.' }],
  feedingTable: [{ petWeightGMin: 0, petWeightGMax: 5000, dailyG: 40, lifeStage: 'any' }],
  constituents: [
    { variantId: 'v1', values: [{ key: 'protein', valueBp: 2650 }] },
    { variantId: 'v2', values: [] },
  ],
  deliveryNote: null,
  sizeGuideId: null,
  ...over,
});

async function openContent(data = content()) {
  let saved: unknown;
  server.use(
    http.get(`${API}/admin/products/p1/content`, () => HttpResponse.json({ data })),
    http.put(`${API}/admin/products/p1/content`, async ({ request }) => {
      saved = await request.json();
      return HttpResponse.json({ data });
    }),
  );
  renderApp('/admin/products/p1');
  const section = await screen.findByTestId('product-content');
  return { section, saved: () => saved };
}

describe('product content editor', () => {
  it('shows the stored specs, then switches tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    const { section } = await openContent();
    expect(await within(section).findByLabelText('Spec 1 label')).toHaveValue('Origin');
    const tabs = within(section).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Specs',
      'Constituents',
      'FAQ',
      'Feeding',
      'Size guide and delivery',
    ]);
    tabs[0]?.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(section).getAllByLabelText(/Red.* protein \(%\)/i)[0]).toHaveValue('26.5');
  });

  it('adds, reorders and removes FAQ rows with named buttons', async () => {
    const user = userEvent.setup();
    const { section } = await openContent();
    await user.click(within(section).getByRole('tab', { name: 'FAQ' }));
    await user.click(within(section).getByRole('button', { name: 'Add a question' }));
    await user.type(within(section).getByLabelText('Question 2'), 'Second?');
    await user.type(within(section).getByLabelText('Answer 2'), 'Yes.');
    await user.click(within(section).getByRole('button', { name: 'Move question 2 up' }));
    expect(within(section).getByLabelText('Question 1')).toHaveValue('Second?');
    expect(within(section).getByRole('button', { name: 'Move question 1 up' })).toBeDisabled();
    await user.click(within(section).getByRole('button', { name: 'Remove question 1' }));
    expect(within(section).queryByLabelText('Question 2')).toBeNull();
  });

  it('saves percent as basis points and kg as grams', async () => {
    const user = userEvent.setup();
    const { section, saved } = await openContent();
    await user.click(within(section).getByRole('tab', { name: 'Feeding' }));
    await user.clear(within(section).getByLabelText('Band 1 up to (kg)'));
    await user.type(within(section).getByLabelText('Band 1 up to (kg)'), '7.5');
    await user.click(within(section).getByRole('button', { name: 'Save page content' }));
    await waitFor(() => expect(saved()).toBeTruthy());
    const body = saved() as {
      feedingTable: { petWeightGMax: number }[];
      constituents: { values: { key: string; valueBp: number }[] }[];
    };
    expect(body.feedingTable[0]?.petWeightGMax).toBe(7500);
    expect(body.constituents[0]?.values).toEqual([{ key: 'protein', valueBp: 2650 }]);
  });

  it('flags a gap in the feeding table while typing and refuses to save it', async () => {
    const user = userEvent.setup();
    const { section, saved } = await openContent();
    await user.click(within(section).getByRole('tab', { name: 'Feeding' }));
    await user.click(within(section).getByRole('button', { name: 'Add a band' }));
    // The new band starts where the last one ended; move it away to make a gap.
    const from = within(section).getByLabelText('Band 2 from (kg)');
    expect(from).toHaveValue('5');
    await user.clear(from);
    await user.type(from, '6');
    await user.type(within(section).getByLabelText('Band 2 up to (kg)'), '10');
    await user.type(within(section).getByLabelText('Band 2 grams a day'), '70');
    expect(await within(section).findByText('Gap between 5 kg and 6 kg')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Save page content' }));
    expect(
      await within(section).findByRole('tab', { name: /Feeding \(needs attention\)/ }),
    ).toBeInTheDocument();
    expect(saved()).toBeUndefined();
  });

  it('shows the server sentence when the save is refused', async () => {
    const user = userEvent.setup();
    const { section } = await openContent();
    server.use(
      http.put(`${API}/admin/products/p1/content`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: {
                formErrors: [],
                fieldErrors: { sizeGuideId: ['This size guide does not exist'] },
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await user.click(within(section).getByRole('button', { name: 'Save page content' }));
    expect(await screen.findByText(/This size guide does not exist/)).toBeInTheDocument();
  });
});

describe('size guides screen', () => {
  const guide = {
    id: 'g1',
    slug: 'harness',
    title: 'Harness sizes',
    table: {
      columns: ['Chest (cm)'],
      rows: [{ size: 'M', label: 'Medium', values: ['55 to 70'] }],
    },
    howtoMd: '1. Measure.',
    tip: 'In between sizes? Size up.',
    productCount: 2,
  };

  it('is one more item in the admin nav and lists guides with their product count', async () => {
    server.use(http.get(`${API}/admin/size-guides`, () => HttpResponse.json({ data: [guide] })));
    renderApp('/admin/size-guides');
    const row = await screen.findByTestId('admin-size-guide-row');
    expect(row).toHaveTextContent('Harness sizes');
    expect(row).toHaveTextContent('harness · 2 products');
    expect(
      within(screen.getByTestId('admin-nav')).getByRole('link', { name: 'Size guides' }),
    ).toBeInTheDocument();
  });

  it('creates a guide from the form and shows the field sentence for a bad slug', async () => {
    const user = userEvent.setup();
    let posted: unknown;
    server.use(
      http.post(`${API}/admin/size-guides`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ data: guide }, { status: 201 });
      }),
    );
    renderApp('/admin/size-guides');
    await user.click(await screen.findByRole('button', { name: 'New size guide' }));
    const form = await screen.findByTestId('size-guide-form');
    await user.type(within(form).getByLabelText('Title'), 'Harness sizes');
    await user.type(within(form).getByLabelText('Slug'), 'Bad Slug');
    await user.type(within(form).getByLabelText('Row 1, Chest (cm)'), '55 to 70');
    await user.click(within(form).getByRole('button', { name: 'Save size guide' }));
    expect(
      await within(form).findByText('Lower-case letters, numbers and dashes only'),
    ).toBeInTheDocument();
    expect(posted).toBeUndefined();
    await user.clear(within(form).getByLabelText('Slug'));
    await user.type(within(form).getByLabelText('Slug'), 'harness');
    await user.click(within(form).getByRole('button', { name: 'Save size guide' }));
    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted).toMatchObject({
      slug: 'harness',
      table: {
        columns: ['Chest (cm)'],
        rows: [{ size: 'S', label: 'Small', values: ['55 to 70'] }],
      },
    });
  });
});
