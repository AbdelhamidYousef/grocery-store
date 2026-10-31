import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog';

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        title="Delete item"
        onClose={() => {
          setOpen(false);
          onClose();
        }}
      >
        <p>Are you sure?</p>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens as a labelled dialog and closes with the Close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Delete item' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on the native cancel (Escape) path via the close event', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    // Browsers turn Escape into close(); jsdom has no Escape handling, so close it the same way.
    screen.getByTestId('dialog').closest('dialog')?.close();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the backdrop (the dialog element itself) is clicked', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByTestId('dialog'));
    expect(onClose).toHaveBeenCalled();
  });
});
