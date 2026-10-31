// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './test/server';

// Vitest globals are off, so Testing Library cannot register its own cleanup; do it here.
afterEach(cleanup);

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
