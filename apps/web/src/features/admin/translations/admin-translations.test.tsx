import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

const report = {
  locale: 'de',
  entities: [
    {
      entity: 'brand',
      total: 2,
      complete: 1,
      missing: [{ id: 'b-1', slug: 'waggle', label: 'Waggle', fields: ['tagline', 'story'] }],
    },
    { entity: 'product', total: 1, complete: 1, missing: [] },
  ],
};

describe('admin translations', () => {
  it('shows the completeness report and opens the editor with a copy-from-English button', async () => {
    server.use(
      signedInAs({ role: 'admin' }),
      http.get(`${API}/admin/translations/missing`, () => HttpResponse.json({ data: report })),
      http.get(`${API}/admin/translations/brand/b-1`, () =>
        HttpResponse.json({
          data: {
            entity: 'brand',
            id: 'b-1',
            english: { name: 'Waggle', tagline: 'Wag more', story: 'Our story', slug: 'waggle' },
            locales: { de: null, fr: null },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/admin/translations');
    expect(await screen.findByText('1/2 complete')).toBeInTheDocument();
    expect(screen.getByText('Everything is translated.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Waggle' }));
    const form = await screen.findByTestId('translation-form-de');
    await user.click(screen.getByRole('button', { name: 'Copy from English' }));
    expect(form.querySelector<HTMLInputElement>('input[value="Waggle"]')).not.toBeNull();
  });
});
