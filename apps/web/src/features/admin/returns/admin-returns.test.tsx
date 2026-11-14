import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAdminReturnDetail } from '../../../test/fixtures';
import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
});

const row = (n: number, over: object = {}) => ({
  id: `r${n}`,
  orderNumber: `PW-2026-00000${n}`,
  email: `ada${n}@example.com`,
  status: 'requested',
  reason: 'damaged',
  itemCount: n,
  refundCents: 1099 * n,
  currency: 'EUR',
  createdAt: '2026-11-05T10:00:00.000Z',
  ...over,
});
// The page refetches after every action, so the mock must remember what the last action returned.
function statefulDetail(initial: object) {
  const state = { current: initial };
  return {
    state,
    handler: http.get(`${API}/admin/returns/:id`, () => HttpResponse.json({ data: state.current })),
  };
}
const detailOf = (detail: object) => statefulDetail(detail).handler;

describe('admin returns list', () => {
  it('shows the requests to review first and asks the API per tab', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/admin/returns`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({
          data: [row(1), row(2)],
          meta: { page: 1, limit: 24, total: 2, totalPages: 1 },
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/returns');
    const rows = await screen.findAllByTestId('admin-return-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('PW-2026-000001');
    expect(rows[1]).toHaveTextContent('€21.98');
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', '/admin/returns/r1');
    expect(asked[0]).toContain('status=requested');
    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(asked.some((q) => !q.includes('status='))).toBe(true));
  });

  it('says so when a queue is empty', async () => {
    server.use(
      http.get(`${API}/admin/returns`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 24, total: 0, totalPages: 0 } }),
      ),
    );
    renderApp('/admin/returns');
    expect(await screen.findByText('No returns here.')).toBeInTheDocument();
  });
});

describe('admin return detail', () => {
  it('offers only approve and decline for a new request', async () => {
    server.use(detailOf(makeAdminReturnDetail()));
    renderApp('/admin/returns/ret1');
    expect(await screen.findByRole('button', { name: 'Approve return' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline return' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark received' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Refund/ })).not.toBeInTheDocument();
  });

  it('approves, and shows the answer from the server', async () => {
    let approved = false;
    server.use(
      http.get(`${API}/admin/returns/:id`, () =>
        HttpResponse.json({
          data: makeAdminReturnDetail(
            approved ? { allowedNext: ['received'] } : {},
            approved ? { status: 'approved' } : {},
          ),
        }),
      ),
      http.post(`${API}/admin/returns/:id/approve`, () => {
        approved = true;
        return HttpResponse.json({
          data: makeAdminReturnDetail({ allowedNext: ['received'] }, { status: 'approved' }),
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/returns/ret1');
    await user.click(await screen.findByRole('button', { name: 'Approve return' }));
    expect(await screen.findByRole('button', { name: 'Mark received' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve return' })).not.toBeInTheDocument();
  });

  it('declines with a reason the customer will see', async () => {
    let sent: unknown;
    const detail = statefulDetail(makeAdminReturnDetail());
    server.use(
      detail.handler,
      http.post(`${API}/admin/returns/:id/reject`, async ({ request }) => {
        sent = await request.json();
        detail.state.current = makeAdminReturnDetail(
          { allowedNext: [] },
          { status: 'rejected', rejectReason: 'Worn' },
        );
        return HttpResponse.json({ data: detail.state.current });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/returns/ret1');
    await user.click(await screen.findByRole('button', { name: 'Decline return' }));
    await user.type(screen.getByLabelText(/Reason/), 'Worn');
    await user.click(screen.getByRole('button', { name: 'Confirm decline' }));
    await waitFor(() => expect(sent).toEqual({ reason: 'Worn' }));
    expect(await screen.findByText('Nothing more to do for this return.')).toBeInTheDocument();
  });

  it('sends the ticked lines when marking received, and never lets a damaged line be ticked', async () => {
    let sent: { restockItemIds?: string[] } = {};
    const detail = makeAdminReturnDetail(
      { allowedNext: ['received'], restockItemIds: ['ri1'] },
      {
        status: 'approved',
        items: [
          {
            id: 'ri1',
            orderItemId: 'oi1',
            productName: 'Rope Tug',
            variantName: 'Small',
            imageUrl: null,
            quantity: 1,
            reason: 'wrong_size',
            refundCents: 1099,
          },
          {
            id: 'ri2',
            orderItemId: 'oi2',
            productName: 'Squeaky Ball',
            variantName: 'One size',
            imageUrl: null,
            quantity: 1,
            reason: 'damaged',
            refundCents: 500,
          },
        ],
      },
    );
    server.use(
      detailOf(detail),
      http.post(`${API}/admin/returns/:id/receive`, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json({ data: { ...detail, allowedNext: ['refunded'] } });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/returns/ret1');
    const rope = await screen.findByRole('checkbox', { name: /Rope Tug/ });
    expect(rope).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Squeaky Ball/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Mark received' }));
    await waitFor(() => expect(sent).toEqual({ restockItemIds: ['ri1'] }));
  });

  it('refunds with the shipping option, shows the amount, and labels demo mode', async () => {
    let sent: unknown;
    const detail = makeAdminReturnDetail(
      { allowedNext: ['refunded'], simulatedMode: true },
      { status: 'received' },
    );
    const state = statefulDetail(detail);
    server.use(
      state.handler,
      http.post(`${API}/admin/returns/:id/refund`, async ({ request }) => {
        sent = await request.json();
        state.state.current = makeAdminReturnDetail(
          { allowedNext: [] },
          { status: 'refunded', simulated: true },
        );
        return HttpResponse.json({ data: state.state.current });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/returns/ret1');
    expect(await screen.findByRole('note')).toHaveTextContent('recorded as simulated');
    expect(screen.getByRole('button', { name: 'Refund €10.99' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Also refund shipping \(€4.90\)/ }));
    await user.click(screen.getByRole('button', { name: 'Refund €15.89' }));
    await waitFor(() => expect(sent).toEqual({ refundShipping: true }));
    expect(await screen.findByText('Simulated refund')).toBeInTheDocument();
  });

  it('says shipping was already refunded, and shows a failure from the API', async () => {
    server.use(
      detailOf(
        makeAdminReturnDetail(
          { allowedNext: ['refunded'], shippingRefundable: false },
          { status: 'received' },
        ),
      ),
      http.post(`${API}/admin/returns/:id/refund`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'PAYMENT_PROVIDER_ERROR',
              message: 'The payment service is unavailable',
            },
          },
          { status: 502 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/returns/ret1');
    expect(await screen.findByText(/Shipping was already refunded/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Refund/ }));
    expect(await screen.findByText('The payment service is unavailable')).toBeInTheDocument();
  });

  it('shows a not-found message', async () => {
    server.use(
      http.get(`${API}/admin/returns/:id`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Return not found' } },
          { status: 404 },
        ),
      ),
    );
    renderApp('/admin/returns/nope');
    expect(await screen.findByText("We can't find that return")).toBeInTheDocument();
  });
});
