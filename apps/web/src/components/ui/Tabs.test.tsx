import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Tabs } from './Tabs';

function Harness({ initial = 'a' }: { initial?: string }) {
  const [id, setId] = useState(initial);
  return (
    <Tabs
      label="Info"
      selectedId={id}
      onSelect={setId}
      tabs={[
        { id: 'a', label: 'Alpha', panel: <p>Alpha panel</p> },
        { id: 'b', label: 'Beta', panel: <p>Beta panel</p> },
        { id: 'c', label: 'Gamma', panel: <p>Gamma panel</p> },
      ]}
    />
  );
}

describe('Tabs', () => {
  it('names the list, marks one tab selected and links it to a focusable panel', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Info' })).toBeInTheDocument();
    const [alpha, beta] = screen.getAllByRole('tab');
    expect(alpha).toHaveAttribute('aria-selected', 'true');
    expect(beta).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(panel).toHaveAttribute('aria-labelledby', alpha?.id);
    expect(alpha).toHaveAttribute('aria-controls', panel.id);
    expect(screen.getByText('Alpha panel')).toBeInTheDocument();
    expect(screen.queryByText('Beta panel')).toBeNull();
  });

  it('keeps only the selected tab in the Tab order (roving tabindex)', () => {
    render(<Harness />);
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
  });

  it('moves with the arrow keys, wraps around, and Home/End jump to the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [alpha, beta, gamma] = screen.getAllByRole('tab');
    alpha?.focus();
    await user.keyboard('{ArrowRight}');
    expect(beta).toHaveFocus();
    expect(beta).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Beta panel')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(gamma).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(alpha).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(gamma).toHaveFocus();
    await user.keyboard('{Home}');
    expect(alpha).toHaveFocus();
    expect(screen.getByText('Alpha panel')).toBeInTheDocument();
  });

  it('selects on click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('tab', { name: 'Gamma' }));
    expect(screen.getByText('Gamma panel')).toBeInTheDocument();
  });

  it('falls back to the first tab for an unknown id', () => {
    render(<Harness initial="zzz" />);
    expect(screen.getByText('Alpha panel')).toBeInTheDocument();
  });
});
