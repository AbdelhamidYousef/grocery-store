import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
});

const approval = (over: object = {}) => ({
  orderNumber: 'PW-2026-000321',
  email: 'sam@example.test',
  orderStatus: 'awaiting_vet_approval',
  totalCents: 3490,
  currency: 'EUR',
  placedAt: '2026-11-10T10:00:00.000Z',
  vetName: 'Dr Rosa Marsh',
  clinic: 'Pawside Vet Clinic',
  vetEmail: 'rosa@pawside-vet.test',
  decision: 'pending',
  decidedBy: null,
  decidedAt: null,
  reason: null,
  confirmationCode: null,
  items: [{ productName: 'Calm Chews', variantName: '30 pack', quantity: 2 }],
  simulatedMode: false,
  ...over,
});
const listOf = (rows: object[]) =>
  http.get(`${API}/admin/vet-approvals`, () =>
    HttpResponse.json({
      data: rows,
      meta: { page: 1, limit: 24, total: rows.length, totalPages: 1 },
    }),
  );

describe('admin vet approvals', () => {
  it('shows the waiting orders with the vet, items and demo notice', async () => {
    server.use(listOf([approval()]));
    renderApp('/admin/vet-approvals');
    const row = await screen.findByTestId('admin-vet-row');
    expect(row).toHaveTextContent('Dr Rosa Marsh, Pawside Vet Clinic (rosa@pawside-vet.test)');
    expect(row).toHaveTextContent('2 × Calm Chews (30 pack)');
    expect(row).toHaveTextContent('€34.90');
    expect(screen.getByText(/Nobody is emailed/)).toBeInTheDocument();
  });

  it('approves in one click', async () => {
    let approved = false;
    server.use(
      http.get(`${API}/admin/vet-approvals`, () =>
        HttpResponse.json({
          data: approved ? [] : [approval()],
          meta: { page: 1, limit: 24, total: approved ? 0 : 1, totalPages: 1 },
        }),
      ),
      http.post(`${API}/admin/vet-approvals/:number/approve`, () => {
        approved = true;
        return HttpResponse.json({ data: approval({ decision: 'approved' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/vet-approvals');
    await user.click(await screen.findByRole('button', { name: /^Approve order/ }));
    expect(await screen.findByText('Nothing in this queue.')).toBeInTheDocument();
  });

  it('rejects with a reason that is sent to the API', async () => {
    let sent: unknown;
    server.use(
      listOf([approval()]),
      http.post(`${API}/admin/vet-approvals/:number/reject`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ data: approval({ decision: 'rejected' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/vet-approvals');
    await user.click(await screen.findByRole('button', { name: /^Reject order/ }));
    await user.type(screen.getByLabelText(/Reason/), 'Not suitable');
    await user.click(screen.getByRole('button', { name: 'Confirm reject and refund' }));
    await waitFor(() => expect(sent).toEqual({ reason: 'Not suitable' }));
  });

  it('warns about demo mode refunds, shows decided rows and an API failure', async () => {
    server.use(
      listOf([approval({ simulatedMode: true })]),
      http.post(`${API}/admin/vet-approvals/:number/approve`, () =>
        HttpResponse.json(
          {
            error: { code: 'CONFLICT', message: 'This order is cancelled, not waiting for a vet' },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/vet-approvals');
    await user.click(await screen.findByRole('button', { name: /^Reject order/ }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('note')).toHaveTextContent('simulated refund');
    await user.click(screen.getByRole('button', { name: /^Approve order/ }));
    expect(await screen.findByText(/not waiting for a vet/)).toBeInTheDocument();
  });

  it('shows who decided and the simulated confirmation code on the approved tab', async () => {
    server.use(
      http.get(`${API}/admin/vet-approvals`, ({ request }) => {
        const d = new URL(request.url).searchParams.get('decision');
        const rows =
          d === 'approved'
            ? [
                approval({
                  decision: 'approved',
                  decidedBy: 'admin:boss@pawsome.test',
                  confirmationCode: 'VET-SIM-ABCD1234',
                }),
              ]
            : [];
        return HttpResponse.json({
          data: rows,
          meta: { page: 1, limit: 24, total: rows.length, totalPages: 1 },
        });
      }),
    );
    const user = userEvent.setup();
    renderApp('/admin/vet-approvals');
    await user.click(await screen.findByRole('button', { name: 'Approved' }));
    const row = await screen.findByTestId('admin-vet-row');
    expect(within(row).getByText('VET-SIM-ABCD1234')).toBeInTheDocument();
    expect(row).toHaveTextContent('admin:boss@pawsome.test');
  });
});
