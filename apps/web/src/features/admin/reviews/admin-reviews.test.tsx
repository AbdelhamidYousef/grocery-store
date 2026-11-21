import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

const review = (n: number, over: object = {}) => ({
  id: `r${n}`,
  productId: 'p1',
  productName: 'Rope Tug',
  productSlug: 'rope-tug',
  authorName: `Ada ${n}.`,
  authorEmail: `ada${n}@example.com`,
  rating: 4,
  title: `Review ${n}`,
  body: 'My beagle loves this tug, it has survived a month of games.',
  verifiedBuyer: n % 2 === 1,
  wouldRecommend: true,
  status: 'pending',
  rejectReason: null,
  photos: n === 1 ? [{ id: 'ph1', path: '/reviews/a.webp' }] : [],
  createdAt: '2026-10-01T10:00:00.000Z',
  moderatedAt: null,
  ...over,
});
const list = (rows: object[]) => ({
  data: rows,
  meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 },
});

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
});

describe('admin review moderation', () => {
  it('lists the pending queue with photos, verified tags and the author email', async () => {
    server.use(
      http.get(`${API}/admin/reviews`, () => HttpResponse.json(list([review(1), review(2)]))),
    );
    renderApp('/admin/reviews');
    const rows = await screen.findAllByTestId('admin-review-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Verified buyer')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Not verified')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('link', { name: 'Open photo 1 full size' })).toHaveAttribute(
      'href',
      '/reviews/a.webp',
    );
    expect(within(rows[0]!).getByText(/ada1@example.com/)).toBeInTheDocument();
  });

  it('shows an empty queue', async () => {
    server.use(http.get(`${API}/admin/reviews`, () => HttpResponse.json(list([]))));
    renderApp('/admin/reviews');
    expect(await screen.findByText('Nothing in this queue.')).toBeInTheDocument();
  });

  it('approves one review and refreshes the queue', async () => {
    const approved: string[] = [];
    let rows = [review(1)];
    server.use(
      http.get(`${API}/admin/reviews`, () => HttpResponse.json(list(rows))),
      http.post(`${API}/admin/reviews/:id/approve`, ({ params }) => {
        approved.push(String(params.id));
        rows = [];
        return HttpResponse.json({ data: review(1, { status: 'approved' }) });
      }),
    );
    renderApp('/admin/reviews');
    await userEvent.click(await screen.findByRole('button', { name: /^Approve review/ }));
    await waitFor(() => expect(approved).toEqual(['r1']));
    expect(await screen.findByText('Nothing in this queue.')).toBeInTheDocument();
  });

  it('asks for a reason before rejecting and sends it', async () => {
    let body: unknown = null;
    server.use(
      http.get(`${API}/admin/reviews`, () => HttpResponse.json(list([review(1)]))),
      http.post(`${API}/admin/reviews/r1/reject`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: review(1, { status: 'rejected' }) });
      }),
    );
    renderApp('/admin/reviews');
    await userEvent.click(await screen.findByRole('button', { name: /^Reject review/ }));
    await userEvent.type(
      screen.getByLabelText('Reason (kept on record)'),
      'Contains a phone number',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(body).toEqual({ reason: 'Contains a phone number' }));
  });

  it('shows the server message when a reject has no valid reason', async () => {
    server.use(
      http.get(`${API}/admin/reviews`, () => HttpResponse.json(list([review(1)]))),
      http.post(`${API}/admin/reviews/r1/reject`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: { fieldErrors: { reason: ['Too small'] } },
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderApp('/admin/reviews');
    await userEvent.click(await screen.findByRole('button', { name: /^Reject review/ }));
    await userEvent.type(screen.getByLabelText('Reason (kept on record)'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    expect(await screen.findByText('reason: Too small')).toBeInTheDocument();
  });

  it('bulk-approves the ticked reviews only', async () => {
    const approved: string[] = [];
    server.use(
      http.get(`${API}/admin/reviews`, () =>
        HttpResponse.json(list([review(1), review(2), review(3)])),
      ),
      http.post(`${API}/admin/reviews/:id/approve`, ({ params }) => {
        approved.push(String(params.id));
        return HttpResponse.json({ data: review(1, { status: 'approved' }) });
      }),
    );
    renderApp('/admin/reviews');
    await userEvent.click(await screen.findByLabelText('Select review "Review 1"'));
    await userEvent.click(screen.getByLabelText('Select review "Review 3"'));
    await userEvent.click(screen.getByTestId('bulk-approve'));
    await waitFor(() => expect(approved).toEqual(['r1', 'r3']));
  });

  it('asks before deleting and does nothing when cancelled', async () => {
    let deleted = false;
    server.use(
      http.get(`${API}/admin/reviews`, () => HttpResponse.json(list([review(1)]))),
      http.delete(`${API}/admin/reviews/r1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderApp('/admin/reviews');
    await userEvent.click(await screen.findByRole('button', { name: /^Delete review/ }));
    expect(confirm).toHaveBeenCalled();
    expect(deleted).toBe(false);
    confirm.mockRestore();
  });

  it('switches to the rejected queue and shows the reason', async () => {
    server.use(
      http.get(`${API}/admin/reviews`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(
          list(
            status === 'rejected'
              ? [review(2, { status: 'rejected', rejectReason: 'Spam link' })]
              : [],
          ),
        );
      }),
    );
    renderApp('/admin/reviews');
    await userEvent.click(await screen.findByRole('button', { name: 'Rejected' }));
    expect(await screen.findByText('Spam link')).toBeInTheDocument();
  });

  it('has Reviews in the admin menu', async () => {
    renderApp('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'Reviews' })).toHaveAttribute(
      'href',
      '/admin/reviews',
    );
  });
});
