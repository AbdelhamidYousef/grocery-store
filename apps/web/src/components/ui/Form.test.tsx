import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Checkbox } from './Checkbox';
import { Input } from './Input';
import { Select } from './Select';

describe('Input', () => {
  it('is found by its label and links hint and error text', () => {
    render(<Input label="Email" hint="We never share it" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('We never share it Enter a valid email');
  });

  it('is not marked invalid without an error', () => {
    render(<Input label="Name" />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
  });

  it('accepts typing', async () => {
    render(<Input label="Name" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Rex');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Rex');
  });
});

describe('Select', () => {
  it('is a combobox named by its label and changes with the keyboard', async () => {
    render(
      <Select label="Sort by" defaultValue="new">
        <option value="new">Newest</option>
        <option value="price">Price</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    await userEvent.selectOptions(select, 'price');
    expect(select).toHaveValue('price');
  });
});

describe('Checkbox', () => {
  it('toggles from its label and with Space', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="In stock only" />);
    const box = screen.getByRole('checkbox', { name: 'In stock only' });
    await user.click(screen.getByText('In stock only'));
    expect(box).toBeChecked();
    await user.tab();
    await user.tab();
    box.focus();
    await user.keyboard(' ');
    expect(box).not.toBeChecked();
  });

  it('describes its error', () => {
    render(<Checkbox label="Accept terms" error="Required" />);
    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toHaveAccessibleDescription(
      'Required',
    );
  });
});
