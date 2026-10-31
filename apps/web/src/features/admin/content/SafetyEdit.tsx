import { SAFETY_SEVERITIES, SafetySeveritySchema, type AdminSafetyNotice } from '@store/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../../../api/client';
import { Seo } from '../../../components/Seo';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { AdminVariantPicker, type PickedVariant } from './AdminVariantPicker';
import { inputToIso, isoToInput } from './datetime';
import { MarkdownEditor } from './MarkdownEditor';
import {
  useAdminSafetyNotice,
  useDeleteSafetyNotice,
  useNotifySafetyNotice,
  useSaveSafetyNotice,
} from './queries';

export function SafetyEdit() {
  const { id } = useParams();
  const isNew = id === undefined;
  const { data: notice, isPending, error, refetch } = useAdminSafetyNotice(id);

  if (!isNew && isPending && !error) return <Skeleton className="h-64 w-full rounded-card" />;
  if (!isNew && (error || !notice)) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div role="alert">
        <p className="font-semibold text-danger">
          {missing ? 'That notice does not exist.' : 'We could not load this notice.'}
        </p>
        {!missing && (
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
        <Link to="/admin/safety" className="mt-2 block font-semibold text-primary-strong underline">
          Back to safety notices
        </Link>
      </div>
    );
  }
  return <SafetyForm key={notice?.id ?? 'new'} notice={notice ?? null} />;
}

function SafetyForm({ notice }: { notice: AdminSafetyNotice | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveSafetyNotice(notice?.id ?? null);
  const remove = useDeleteSafetyNotice();
  const [title, setTitle] = useState(notice?.title ?? '');
  const [bodyMd, setBodyMd] = useState(notice?.bodyMd ?? '');
  const [severity, setSeverity] = useState<AdminSafetyNotice['severity']>(
    notice?.severity ?? 'warning',
  );
  const [status, setStatus] = useState<'draft' | 'published'>(notice?.status ?? 'draft');
  const [startsAt, setStartsAt] = useState(isoToInput(notice?.startsAt));
  const [endsAt, setEndsAt] = useState(isoToInput(notice?.endsAt));
  const [variants, setVariants] = useState<PickedVariant[]>(
    (notice?.variants ?? []).map((v) => ({ id: v.id, label: `${v.productName}: ${v.name}` })),
  );
  const [message, setMessage] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    save.mutate(
      {
        title,
        bodyMd,
        severity,
        status,
        startsAt: inputToIso(startsAt),
        endsAt: inputToIso(endsAt),
        variantIds: variants.map((v) => v.id),
      },
      {
        onSuccess: (saved) => {
          toast.show(notice ? 'Notice saved' : 'Notice created', 'success');
          if (!notice) void navigate(`/admin/safety/${saved.id}`, { replace: true });
        },
        onError: (err) => setMessage(adminErrorMessage(err)),
      },
    );
  };

  return (
    <section aria-labelledby="safety-edit-heading" data-testid="admin-safety-form">
      <Seo title={notice ? `Edit ${notice.title}` : 'New safety notice'} noindex />
      <Link to="/admin/safety" className="text-sm font-semibold text-primary-strong underline">
        Back to safety notices
      </Link>
      <h2 id="safety-edit-heading" className="mt-2 font-display text-xl font-bold">
        {notice ? notice.title : 'New safety notice'}
      </h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <FormAlert message={message} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Select
            label="Severity"
            value={severity}
            onChange={(e) => {
              const parsed = SafetySeveritySchema.safeParse(e.target.value);
              if (parsed.success) setSeverity(parsed.data);
            }}
          >
            {SAFETY_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input
            label="Starts (UTC)"
            type="datetime-local"
            hint="Empty means now."
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label="Ends (UTC)"
            type="datetime-local"
            hint="Empty means until you end it."
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value === 'published' ? 'published' : 'draft')}
          >
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published</option>
          </Select>
        </div>
        <MarkdownEditor label="Text" value={bodyMd} onChange={setBodyMd} rows={8} />
        <AdminVariantPicker selected={variants} onChange={setVariants} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={save.isPending}>
            {notice ? 'Save notice' : 'Create notice'}
          </Button>
          {notice && (
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (!window.confirm(`Delete the notice "${notice.title}"?`)) return;
                remove.mutate(notice.id, {
                  onSuccess: () => {
                    toast.show('Notice deleted', 'success');
                    void navigate('/admin/safety');
                  },
                  onError: (err) => setMessage(adminErrorMessage(err)),
                });
              }}
            >
              Delete notice
            </Button>
          )}
        </div>
      </form>
      {notice && <NotifyPanel notice={notice} />}
    </section>
  );
}

// Emails past buyers of the affected variants. Safe to press twice: the server only emails buyers
// who have not been emailed for this notice yet, and says how many that was.
function NotifyPanel({ notice }: { notice: AdminSafetyNotice }) {
  const notify = useNotifySafetyNotice(notice.id);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section
      aria-labelledby="notify-heading"
      className="mt-8 rounded-card border-2 border-line bg-surface p-4"
      data-testid="admin-safety-notify"
    >
      <h3 id="notify-heading" className="font-display text-lg font-bold">
        Email past buyers
      </h3>
      <p className="mt-1 text-muted" data-testid="delivery-count">
        {notice.deliveryCount} {notice.deliveryCount === 1 ? 'buyer has' : 'buyers have'} been
        emailed so far.
      </p>
      <Button
        className="mt-3"
        variant="secondary"
        loading={notify.isPending}
        disabled={notice.variants.length === 0}
        onClick={() => {
          if (!window.confirm('Email everyone who bought an affected variant?')) return;
          setResult(null);
          setError(null);
          notify.mutate(undefined, {
            onSuccess: (r) =>
              setResult(
                `Queued ${r.queued} ${r.queued === 1 ? 'email' : 'emails'}. ${r.alreadyNotified} had already been emailed.`,
              ),
            onError: (err) => setError(adminErrorMessage(err)),
          });
        }}
      >
        Notify buyers
      </Button>
      {notice.variants.length === 0 && (
        <p className="mt-2 text-sm text-muted">Add affected variants and save first.</p>
      )}
      {result && (
        <p role="status" className="mt-2 font-semibold" data-testid="notify-result">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 font-semibold text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
