import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeUser } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

function apiError(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

describe('login form', () => {
  it('shows required errors inline and focuses the first invalid field', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    const email = screen.getByLabelText('Email');
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter a valid email address');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Required');
  });

  it('wires the autocomplete attributes and a password visibility toggle', async () => {
    renderApp('/login');
    const password = await screen.findByLabelText('Password');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('signs in, normalises the email and goes to the page in ?next', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { user: makeUser() } });
      }),
    );
    const router = renderApp('/login?next=%2Faccount%2Faddresses');
    await userEvent.type(await screen.findByLabelText('Email'), '  Sam@Example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/account/addresses'));
    expect(body).toEqual({ email: 'sam@example.com', password: 'correct horse battery' });
  });

  it('ignores a ?next that points off-site', async () => {
    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({ data: { user: makeUser() } })),
    );
    const router = renderApp('/login?next=https%3A%2F%2Fevil.example');
    await userEvent.type(await screen.findByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever-it-is');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('shows a wrong password as a form-level message, not a field error', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        apiError(401, 'UNAUTHENTICATED', 'Invalid email or password'),
      ),
    );
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'nope-nope-nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Invalid email or password');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });
});

describe('register form', () => {
  it('uses new-password, validates with the shared rules and flags a common password', async () => {
    renderApp('/register');
    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    await userEvent.type(screen.getByLabelText('First name'), 'Sam');
    await userEvent.type(screen.getByLabelText('Last name'), 'Rivers');
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
    await userEvent.type(password, 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This password is too common')).toBeInTheDocument();
    expect(password).toHaveFocus();
  });

  it('puts the API 409 on the email field', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        apiError(409, 'CONFLICT', 'An account with this email already exists'),
      ),
    );
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('First name'), 'Sam');
    await userEvent.type(screen.getByLabelText('Last name'), 'Rivers');
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-fine-long-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const email = screen.getByLabelText('Email');
    await waitFor(() =>
      expect(email).toHaveAccessibleDescription('An account with this email already exists'),
    );
    expect(email).toHaveFocus();
  });

  it('maps server VALIDATION_ERROR fieldErrors onto the fields', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        apiError(400, 'VALIDATION_ERROR', 'Invalid input', {
          fieldErrors: { lastName: ['Too long'] },
        }),
      ),
    );
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('First name'), 'Sam');
    await userEvent.type(screen.getByLabelText('Last name'), 'Rivers');
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-fine-long-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Last name')).toHaveAccessibleDescription('Too long'),
    );
  });

  it('registers and lands on the account page by default', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        HttpResponse.json({ data: { user: makeUser() } }, { status: 201 }),
      ),
    );
    const router = renderApp('/register');
    await userEvent.type(await screen.findByLabelText('First name'), 'Sam');
    await userEvent.type(screen.getByLabelText('Last name'), 'Rivers');
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-fine-long-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
  });
});
