import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StepCard } from './StepCard';

const card = (state: 'active' | 'done' | 'locked') => (
  <StepCard id="shipping" number={2} title="Shipping method" state={state}>
    <button type="button">Continue</button>
  </StepCard>
);

describe('StepCard focus', () => {
  it('does not take focus when it is active on first render', () => {
    render(card('active'));
    expect(document.body).toHaveFocus();
  });

  it('moves focus to its heading when it becomes the active step', () => {
    const { rerender } = render(card('locked'));
    rerender(card('active'));
    expect(screen.getByRole('heading', { name: 'Shipping method' })).toHaveFocus();
  });

  it('leaves focus alone when it stops being active', () => {
    const { rerender } = render(card('active'));
    screen.getByRole('button', { name: 'Continue' }).focus();
    rerender(card('done'));
    expect(screen.queryByRole('heading', { name: 'Shipping method' })).not.toHaveFocus();
  });
});
