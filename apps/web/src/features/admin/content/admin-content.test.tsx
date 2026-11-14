import type {
  AdminContactMessage,
  AdminGuide,
  AdminSafetyNotice,
  AdminWithdrawal,
} from '@store/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeAdminProduct, makeAdminRow } from '../../../test/fixtures';
import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const guide = (over: Partial<AdminGuide> = {}): AdminGuide => ({
  id: 'g1',
  slug: 'choosing-a-leash',
  title: 'Choosing a leash',
  category: 'Dogs',
  status: 'published',
  publishedAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  summary: 'Short.',
  bodyMd: 'Hello **world**',
  coverUrl: null,
  products: [{ id: 'p1', slug: 'rope-tug', name: 'Rope Tug' }],
  ...over,
});

describe('admin navigation', () => {
  it('links to every content screen', async () => {
    server.use(http.get(`${API}/admin/guides`, () => HttpResponse.json({ data: [] })));
    renderApp('/admin/guides');
    const nav = within(await screen.findByRole('navigation', { name: 'Admin' }));
    for (const name of [
      'Guides',
      'Help articles',
      'Testimonials',
      'Safety notices',
      'Withdrawals',
      'Messages',
      'Homepage',
    ]) {
      expect(nav.getByRole('link', { name })).toBeInTheDocument();
    }
  });
});

describe('guides', () => {
  it('lists guides with status and a link to edit', async () => {
    server.use(http.get(`${API}/admin/guides`, () => HttpResponse.json({ data: [guide()] })));
    renderApp('/admin/guides');
    expect(await screen.findByRole('link', { name: 'Choosing a leash' })).toHaveAttribute(
      'href',
      '/admin/guides/g1',
    );
    expect(screen.getByText('published')).toBeInTheDocument();
  });

  it('previews the Markdown live and never as raw HTML', async () => {
    server.use(http.get(`${API}/admin/guides`, () => HttpResponse.json({ data: [] })));
    const user = userEvent.setup();
    renderApp('/admin/guides/new');
    const input = await screen.findByTestId('markdown-input');
    await user.click(input);
    await user.paste('## Heading\n\nSome **bold** <script>window.__x=1</script>');
    const preview = screen.getByTestId('markdown-preview');
    expect(within(preview).getByRole('heading', { level: 2, name: 'Heading' })).toBeInTheDocument();
    expect(within(preview).getByText('bold').tagName).toBe('STRONG');
    expect(preview.querySelector('script')).toBeNull();
  });

  it('creates a guide with the chosen products, as a draft by default', async () => {
    const seen = vi.fn();
    server.use(
      http.get(`${API}/admin/guides`, () => HttpResponse.json({ data: [] })),
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({
          data: [makeAdminRow({ id: 'p9', name: 'Squeaky Fox' })],
          meta: { page: 1, limit: 6, total: 1, totalPages: 1 },
        }),
      ),
      http.post(`${API}/admin/guides`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ data: guide({ id: 'g2', status: 'draft' }) }, { status: 201 });
      }),
      http.get(`${API}/admin/guides/g2`, () => HttpResponse.json({ data: guide({ id: 'g2' }) })),
    );
    const user = userEvent.setup();
    renderApp('/admin/guides/new');
    await user.type(await screen.findByLabelText('Title'), 'My guide');
    await user.type(screen.getByLabelText('Category'), 'Dogs');
    await user.type(screen.getByLabelText('Summary'), 'A summary.');
    await user.click(screen.getByTestId('markdown-input'));
    await user.paste('Body text');
    await user.type(screen.getByLabelText(/Find a product/), 'fox');
    await user.click(await screen.findByRole('button', { name: 'Add Squeaky Fox' }));
    expect(screen.getByRole('button', { name: 'Remove Squeaky Fox' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create guide' }));
    await waitFor(() => expect(seen).toHaveBeenCalled());
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My guide',
        category: 'Dogs',
        status: 'draft',
        productIds: ['p9'],
        bodyMd: 'Body text',
      }),
    );
  });

  it('shows the server message when saving fails', async () => {
    server.use(
      http.get(`${API}/admin/guides`, () => HttpResponse.json({ data: [] })),
      http.post(`${API}/admin/guides`, () =>
        HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'That slug is already used.' } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/guides/new');
    await user.type(await screen.findByLabelText('Title'), 'Dup');
    await user.type(screen.getByLabelText('Category'), 'Dogs');
    await user.type(screen.getByLabelText('Summary'), 'x');
    await user.click(screen.getByTestId('markdown-input'));
    await user.paste('body');
    await user.click(screen.getByRole('button', { name: 'Create guide' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('already used');
  });
});

describe('help articles', () => {
  it('lists articles and creates one through the form', async () => {
    const seen = vi.fn();
    server.use(
      http.get(`${API}/admin/help-articles`, () =>
        HttpResponse.json({
          data: [
            {
              id: 'h1',
              slug: 'shipping-cost',
              topic: 'shipping',
              question: 'How much is shipping?',
              answerMd: 'x',
              status: 'published',
              sortOrder: 0,
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        }),
      ),
      http.post(`${API}/admin/help-articles`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ data: {} }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/help');
    expect(await screen.findByText('How much is shipping?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New article' }));
    await user.type(await screen.findByLabelText('Question'), 'Do you ship abroad?');
    await user.click(within(screen.getByTestId('admin-help-form')).getByTestId('markdown-input'));
    await user.paste('Yes.');
    await user.click(screen.getByRole('button', { name: 'Create article' }));
    await waitFor(() => expect(seen).toHaveBeenCalled());
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Do you ship abroad?',
        topic: 'shipping',
        answerMd: 'Yes.',
      }),
    );
  });
});

describe('withdrawal queue', () => {
  const w = (over: Partial<AdminWithdrawal> = {}): AdminWithdrawal => ({
    id: 'w1',
    reference: 'WD-ABCD1234',
    orderNumber: 'PW-2026-000007',
    email: 'ada@grocery.test',
    itemsText: null,
    reason: 'Changed my mind',
    status: 'new',
    createdAt: '2026-10-30T10:00:00.000Z',
    acknowledgedAt: null,
    ...over,
  });

  it('shows the request and moves it to acknowledged', async () => {
    const seen = vi.fn();
    server.use(
      http.get(`${API}/admin/withdrawals`, () => HttpResponse.json({ data: [w()] })),
      http.patch(`${API}/admin/withdrawals/w1`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ data: w({ status: 'acknowledged' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/withdrawals');
    const row = await screen.findByTestId('admin-row');
    expect(row).toHaveTextContent('PW-2026-000007');
    expect(row).toHaveTextContent('the whole order');
    await user.click(within(row).getByRole('button', { name: 'Acknowledge WD-ABCD1234' }));
    await waitFor(() => expect(seen).toHaveBeenCalledWith({ status: 'acknowledged' }));
  });

  it('offers no action once a request is done', async () => {
    server.use(
      http.get(`${API}/admin/withdrawals`, () =>
        HttpResponse.json({ data: [w({ status: 'done' })] }),
      ),
    );
    renderApp('/admin/withdrawals');
    const row = await screen.findByTestId('admin-row');
    expect(within(row).queryByRole('button')).toBeNull();
  });
});

describe('contact messages', () => {
  const m = (over: Partial<AdminContactMessage> = {}): AdminContactMessage => ({
    id: 'm1',
    reference: 'MSG-ABCD1234',
    name: 'Ada',
    email: 'ada@grocery.test',
    topic: 'order',
    orderNumber: null,
    message: 'Where is my parcel?',
    createdAt: '2026-10-30T10:00:00.000Z',
    handledAt: null,
    ...over,
  });

  it('marks a message handled', async () => {
    const seen = vi.fn();
    server.use(
      http.get(`${API}/admin/contact-messages`, () => HttpResponse.json({ data: [m()] })),
      http.patch(`${API}/admin/contact-messages/m1`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ data: m({ handledAt: '2026-10-31T10:00:00.000Z' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/messages');
    expect(await screen.findByText('Where is my parcel?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark handled MSG-ABCD1234' }));
    await waitFor(() => expect(seen).toHaveBeenCalledWith({ handled: true }));
  });

  it('shows a handled message with a Reopen button', async () => {
    server.use(
      http.get(`${API}/admin/contact-messages`, () =>
        HttpResponse.json({ data: [m({ handledAt: '2026-10-31T10:00:00.000Z' })] }),
      ),
    );
    renderApp('/admin/messages');
    expect(await screen.findByRole('button', { name: 'Reopen MSG-ABCD1234' })).toBeInTheDocument();
    expect(screen.getByText('handled')).toBeInTheDocument();
  });
});

describe('safety notices', () => {
  const notice = (over: Partial<AdminSafetyNotice> = {}): AdminSafetyNotice => ({
    id: 'n1',
    title: 'Red rope recall',
    bodyMd: 'Stop using it.',
    severity: 'recall',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: null,
    status: 'published',
    isActive: true,
    deliveryCount: 3,
    variants: [{ id: 'v1', sku: 'TUG-RED-S', name: 'Red, small', productName: 'Rope Tug' }],
    ...over,
  });

  it('shows the delivery count and notifies buyers, reporting what was queued', async () => {
    server.use(
      http.get(`${API}/admin/safety-notices/n1`, () => HttpResponse.json({ data: notice() })),
      http.get(`${API}/admin/safety-notices`, () => HttpResponse.json({ data: [notice()] })),
      http.post(`${API}/admin/safety-notices/n1/notify`, () =>
        HttpResponse.json({ data: { queued: 2, alreadyNotified: 3 } }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/safety/n1');
    expect(await screen.findByTestId('delivery-count')).toHaveTextContent(
      '3 buyers have been emailed',
    );
    await user.click(screen.getByRole('button', { name: 'Notify buyers' }));
    expect(await screen.findByTestId('notify-result')).toHaveTextContent(
      'Queued 2 emails. 3 had already been emailed.',
    );
  });

  it('disables notifying while no variants are attached', async () => {
    server.use(
      http.get(`${API}/admin/safety-notices/n1`, () =>
        HttpResponse.json({ data: notice({ variants: [] }) }),
      ),
    );
    renderApp('/admin/safety/n1');
    expect(await screen.findByRole('button', { name: 'Notify buyers' })).toBeDisabled();
  });

  it('adds a variant through the picker and saves it with the notice', async () => {
    const seen = vi.fn();
    server.use(
      http.get(`${API}/admin/safety-notices`, () => HttpResponse.json({ data: [] })),
      http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({
          data: [makeAdminRow()],
          meta: { page: 1, limit: 6, total: 1, totalPages: 1 },
        }),
      ),
      http.post(`${API}/admin/safety-notices`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ data: notice({ id: 'n2' }) }, { status: 201 });
      }),
      http.get(`${API}/admin/safety-notices/n2`, () =>
        HttpResponse.json({ data: notice({ id: 'n2' }) }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/safety/new');
    await user.type(await screen.findByLabelText('Title'), 'Warning');
    await user.click(screen.getByTestId('markdown-input'));
    await user.paste('Careful.');
    await user.type(screen.getByLabelText(/Find a product/), 'rope');
    await user.click(await screen.findByRole('button', { name: 'Show variants' }));
    const add = await screen.findAllByRole('button', { name: /^Add Rope Tug/ });
    await user.click(add[0]!);
    await user.click(screen.getByRole('button', { name: 'Create notice' }));
    await waitFor(() => expect(seen).toHaveBeenCalled());
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Warning', severity: 'warning', status: 'draft' }),
    );
    expect((seen.mock.calls[0]?.[0] as { variantIds: string[] }).variantIds).toHaveLength(1);
  });
});

describe('homepage content', () => {
  it('saves edited hero slides and the promo tile', async () => {
    const seen = vi.fn();
    const slide = {
      title: 'Hello',
      text: 'World',
      ctaLabel: 'Go',
      ctaHref: '/c/dogs',
      imageUrl: null,
    };
    server.use(
      http.get(`${API}/admin/home-content`, () =>
        HttpResponse.json({
          data: {
            heroSlides: [slide],
            promoTile: { enabled: false, text: null, linkLabel: null, linkHref: null },
          },
        }),
      ),
      http.put(`${API}/admin/home-content/:key`, async ({ request, params }) => {
        seen(params.key, await request.json());
        return HttpResponse.json({
          data: {
            heroSlides: [slide],
            promoTile: { enabled: true, text: 'Sale', linkLabel: null, linkHref: null },
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/home');
    const slideBox = within(await screen.findByTestId('hero-slide'));
    const title = slideBox.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: 'Save hero slides' }));
    await waitFor(() => expect(seen).toHaveBeenCalledWith('hero_slides', expect.anything()));
    expect((seen.mock.calls[0]?.[1] as { value: { title: string }[] }).value[0]?.title).toBe(
      'New title',
    );

    const promo = within(screen.getByTestId('admin-promo-form'));
    await user.click(promo.getByLabelText('Show the promo tile on the homepage'));
    await user.type(promo.getByLabelText('Text'), 'Sale');
    await user.click(promo.getByRole('button', { name: 'Save promo tile' }));
    await waitFor(() => expect(seen).toHaveBeenCalledWith('promo_tile', expect.anything()));
  });
});
