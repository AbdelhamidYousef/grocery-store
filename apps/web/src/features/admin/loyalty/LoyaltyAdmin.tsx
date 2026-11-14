import {
  formatMoney,
  type AdminReward,
  type AdminRewardInput,
  type RewardKind,
} from '@store/shared';
import { useState, type FormEvent } from 'react';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';
import { centsToInput, inputToCents, inputToInt } from '../money-input';

import { useAdjustPoints, useAdminRewards, useDeleteReward, useSaveReward } from './queries';

const KIND_LABEL: Record<RewardKind, string> = {
  coupon_fixed: 'Money off',
  free_shipping: 'Free shipping',
  gift: 'Free gift',
};

interface FormState {
  name: string;
  description: string;
  cost: string;
  kind: RewardKind;
  value: string;
  active: boolean;
}

function toForm(r: AdminReward | undefined): FormState {
  return r
    ? {
        name: r.name,
        description: r.description,
        cost: String(r.costPoints),
        kind: r.kind,
        value: r.valueCents > 0 ? centsToInput(r.valueCents) : '',
        active: r.active,
      }
    : { name: '', description: '', cost: '', kind: 'coupon_fixed', value: '', active: true };
}

// Typed text -> the API's input, or the messages to show. Money goes through the string parser
// (never a float).
export function parseRewardForm(
  f: FormState,
): { ok: true; input: AdminRewardInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!f.name.trim()) errors.name = 'Required';
  const cost = inputToInt(f.cost);
  if (cost === null || cost < 1) errors.cost = 'A whole number of points, at least 1';
  let valueCents = 0;
  if (f.kind !== 'free_shipping') {
    const v = inputToCents(f.value);
    if (v === null || v < 1) errors.value = 'An amount in euros, for example 5 or 6.99';
    else valueCents = v;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      name: f.name.trim(),
      description: f.description.trim(),
      costPoints: cost ?? 0,
      kind: f.kind,
      valueCents,
      active: f.active,
    },
  };
}

function RewardForm({ reward, onDone }: { reward: AdminReward | undefined; onDone: () => void }) {
  const toast = useToast();
  const save = useSaveReward();
  const [form, setForm] = useState<FormState>(toForm(reward));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const parsed = parseRewardForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    save.mutate(
      { id: reward?.id, input: parsed.input },
      {
        onSuccess: () => {
          toast.show(reward ? 'Reward saved' : 'Reward created', 'success');
          onDone();
        },
        onError: (err) => setServerError(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="admin-reward-form"
      className="flex flex-col gap-4"
    >
      <FormAlert message={serverError} />
      <Input
        label="Name"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        error={errors.name}
      />
      <Input
        label="Description"
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
      />
      <Input
        label="Cost (points)"
        inputMode="numeric"
        hint="100 points are worth 1 euro at checkout"
        value={form.cost}
        onChange={(e) => set('cost', e.target.value)}
        error={errors.cost}
      />
      <Select
        label="Kind"
        value={form.kind}
        onChange={(e) => set('kind', e.target.value as RewardKind)}
      >
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>
      {form.kind !== 'free_shipping' && (
        <Input
          label="Value (EUR)"
          inputMode="decimal"
          hint="What the code takes off, for example 5 or 6.99"
          value={form.value}
          onChange={(e) => set('value', e.target.value)}
          error={errors.value}
        />
      )}
      <Checkbox
        label="Active"
        checked={form.active}
        onChange={(e) => set('active', e.target.checked)}
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {reward ? 'Save reward' : 'Create reward'}
        </Button>
      </div>
    </form>
  );
}

function AdjustForm() {
  const toast = useToast();
  const adjust = useAdjustPoints();
  const [email, setEmail] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = Number.parseInt(delta, 10);
    if (!Number.isInteger(n) || n === 0) {
      setError('Points must be a whole number other than 0 (negative takes points away)');
      return;
    }
    adjust.mutate(
      { email, delta: n, reason },
      {
        onSuccess: (r) => {
          toast.show(`Done. New balance: ${r.balance} points`, 'success');
          setDelta('');
          setReason('');
        },
        onError: (err) => setError(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="admin-points-adjust"
      className="flex max-w-md flex-col gap-3"
    >
      <FormAlert message={error} />
      <Input
        label="Customer email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        label="Points (+ or -)"
        inputMode="numeric"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
      />
      <Input
        label="Reason"
        hint="Kept on the customer's points history"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div>
        <Button type="submit" loading={adjust.isPending}>
          Adjust points
        </Button>
      </div>
    </form>
  );
}

export function LoyaltyAdmin() {
  const { data: rewards, isPending, isError, refetch } = useAdminRewards();
  const remove = useDeleteReward();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminReward | 'new' | null>(null);

  return (
    <div className="flex flex-col gap-10" data-testid="admin-loyalty">
      <section aria-labelledby="rewards-admin-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rewards-admin-heading" className="font-display text-xl font-bold">
            Rewards
          </h2>
          <Button onClick={() => setEditing('new')}>New reward</Button>
        </div>
        <p className="text-muted">
          What customers can buy with points. Each redemption mints a personal, single-use code
          valid for 60 days.
        </p>
        {isError ? (
          <div role="alert" className="text-danger">
            We could not load the rewards.{' '}
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : isPending ? (
          <Skeleton className="h-32 w-full rounded-card" />
        ) : rewards.length === 0 ? (
          <p className="text-muted">No rewards yet.</p>
        ) : (
          <div className="relative overflow-x-auto rounded-card border border-line">
            <table className="w-full text-left">
              <thead className="bg-bg text-sm">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Kind</th>
                  <th className="p-3">Cost</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((r) => (
                  <tr key={r.id} className="border-t border-line" data-testid="admin-reward-row">
                    <td className="min-w-0 break-words p-3 font-semibold">{r.name}</td>
                    <td className="p-3">{KIND_LABEL[r.kind]}</td>
                    <td className="p-3">{r.costPoints} pts</td>
                    <td className="p-3">
                      {r.kind === 'free_shipping'
                        ? 'Free delivery'
                        : formatMoney(r.valueCents, 'EUR')}
                    </td>
                    <td className="p-3">
                      <Badge tone={r.active ? 'success' : 'neutral'}>
                        {r.active ? 'Live' : 'Off'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="secondary" onClick={() => setEditing(r)}>
                          Edit <span className="sr-only">{r.name}</span>
                        </Button>
                        <Button
                          variant="secondary"
                          loading={remove.isPending && remove.variables === r.id}
                          onClick={() => {
                            if (!window.confirm(`Delete "${r.name}"?`)) return;
                            remove.mutate(r.id, {
                              onSuccess: () => toast.show('Reward deleted', 'success'),
                              onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                            });
                          }}
                        >
                          Delete <span className="sr-only">{r.name}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Dialog
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={editing === 'new' || editing === null ? 'New reward' : 'Edit reward'}
          className="max-w-md"
        >
          {editing !== null && (
            <RewardForm
              reward={editing === 'new' ? undefined : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </Dialog>
      </section>

      <section aria-labelledby="adjust-heading" className="flex flex-col gap-3">
        <h2 id="adjust-heading" className="font-display text-xl font-bold">
          Adjust a customer&apos;s points
        </h2>
        <p className="text-muted">
          Adds a labelled adjustment to their history. This is the only way a balance can go
          negative.
        </p>
        <AdjustForm />
      </section>
    </div>
  );
}
