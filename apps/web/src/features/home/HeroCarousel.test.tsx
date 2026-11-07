import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeHome } from '../../test/fixtures';

import { HeroCarousel } from './HeroCarousel';

const slides = makeHome().heroSlides;
const setup = () =>
  render(
    <MemoryRouter>
      <HeroCarousel slides={slides} />
    </MemoryRouter>,
  );
const visibleTitle = () => screen.getByRole('heading', { level: 2 }).textContent;

function mockMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockMotion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HeroCarousel', () => {
  it('is a labelled carousel with slide groups, one visible', () => {
    setup();
    expect(screen.getByRole('region', { name: 'Featured offers' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
    expect(screen.getAllByRole('group', { hidden: true })).toHaveLength(3);
    expect(visibleTitle()).toBe('Happy tails start here');
  });

  it('rotates on its own, and the pause button stops it', () => {
    setup();
    act(() => void vi.advanceTimersByTime(6000));
    expect(visibleTitle()).toBe('Purr-fect playtime');
    fireEvent.click(screen.getByTestId('hero-toggle'));
    expect(screen.getByTestId('hero-toggle')).toHaveTextContent('Play');
    act(() => void vi.advanceTimersByTime(30_000));
    expect(visibleTitle()).toBe('Purr-fect playtime');
  });

  it('starts paused for reduced motion, and play starts it', () => {
    mockMotion(true);
    setup();
    expect(screen.getByTestId('hero-toggle')).toHaveTextContent('Play');
    act(() => void vi.advanceTimersByTime(30_000));
    expect(visibleTitle()).toBe('Happy tails start here');
    fireEvent.click(screen.getByTestId('hero-toggle'));
    act(() => void vi.advanceTimersByTime(6000));
    expect(visibleTitle()).toBe('Purr-fect playtime');
  });

  it('pauses while hovered', () => {
    setup();
    fireEvent.mouseEnter(screen.getByTestId('hero-carousel'));
    act(() => void vi.advanceTimersByTime(30_000));
    expect(visibleTitle()).toBe('Happy tails start here');
    fireEvent.mouseLeave(screen.getByTestId('hero-carousel'));
    act(() => void vi.advanceTimersByTime(6000));
    expect(visibleTitle()).toBe('Purr-fect playtime');
  });

  it('moves with prev, next and the dots, wrapping around', () => {
    setup();
    fireEvent.click(screen.getByTestId('hero-prev'));
    expect(visibleTitle()).toBe('Little pets, big love');
    fireEvent.click(screen.getByTestId('hero-next'));
    expect(visibleTitle()).toBe('Happy tails start here');
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 2' }));
    expect(visibleTitle()).toBe('Purr-fect playtime');
    expect(screen.getByRole('button', { name: 'Go to slide 2' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
