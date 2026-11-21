// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { resetPostcodeMemory } from './lib/postcode';
import { server } from './test/server';

// `findBy*` and `waitFor` return the moment their condition holds, so a longer ceiling costs
// nothing when the machine is idle. The 1 s default is too tight for the first render of a
// lazily loaded route (its module is transformed on demand) when several test workers, or other
// jobs on the same machine, compete for the CPU: the admin pages failed that way, never in
// isolation.
configure({ asyncUtilTimeout: 5000 });

// Vitest globals are off, so Testing Library cannot register its own cleanup; do it here.
afterEach(cleanup);
// The chosen delivery postcode lives in module memory and localStorage.
afterEach(() => {
  resetPostcodeMemory();
  try {
    window.localStorage.clear();
  } catch {
    // No storage in this environment: nothing to clear.
  }
});
// Some state lives in module memory and localStorage; one test must not see another's.

// One msw server for the whole suite: components fetch through the real api/ layer and the
// network is answered by test/server.ts.
beforeAll(() => {
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

// jsdom has no <dialog> methods. This minimal stand-in mirrors the parts the Dialog primitive
// relies on (open attribute, `close` event) so its behaviour can be tested; real focus trapping
// and the top layer are browser features and are covered by the e2e smoke tests instead.
if (
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
