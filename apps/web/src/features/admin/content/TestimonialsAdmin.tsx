import type { AdminTestimonial } from '@store/shared';
import { useState, type FormEvent } from 'react';

import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { useAdminTestimonials, useDeleteTestimonial, useSaveTestimonial } from './queries';

export function TestimonialsAdmin() {
  const { data, isPending, error, refetch } = useAdminTestimonials();
  const [editing, setEditing] = useState<AdminTestimonial | 'new' | null>(null);
  const remove = useDeleteTestimonial();
  const toast = useToast();

  return (
    <section aria-labelledby="testimonials-heading" data-testid="admin-testimonials">
      <Seo title="Admin testimonials" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="testimonials-heading" className="font-display text-xl font-bold">
          Testimonials
        </h2>
        <Button onClick={() => setEditing('new')}>New testimonial</Button>
      </div>
      {editing && (
        <TestimonialForm
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {isPending && !error && <Skeleton className="mt-4 h-40 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the testimonials.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line">
          {data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="break-words">&ldquo;{t.quote}&rdquo;</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>
                    {t.name}, {t.pet}
                  </span>
                  <span aria-label={`${t.rating} out of 5 stars`}>{'★'.repeat(t.rating)}</span>
                  {t.isFeatured && <Badge tone="primary">featured</Badge>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Delete testimonial from ${t.name}`}
                  onClick={() => {
                    if (!window.confirm('Delete this testimonial?')) return;
                    remove.mutate(t.id, {
                      onSuccess: () => toast.show('Testimonial deleted', 'success'),
                    });
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {data.length === 0 && <li className="p-3 text-muted">No testimonials yet.</li>}
        </ul>
      )}
    </section>
  );
}

function TestimonialForm({ item, onDone }: { item: AdminTestimonial | null; onDone: () => void }) {
  const save = useSaveTestimonial(item?.id ?? null);
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? '');
  const [pet, setPet] = useState(item?.pet ?? '');
  const [rating, setRating] = useState(String(item?.rating ?? 5));
  const [quote, setQuote] = useState(item?.quote ?? '');
  const [isFeatured, setIsFeatured] = useState(item?.isFeatured ?? false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    save.mutate(
      { name, pet, rating: Number(rating), quote, isFeatured },
      {
        onSuccess: () => {
          toast.show(item ? 'Testimonial saved' : 'Testimonial created', 'success');
          onDone();
        },
        onError: (err) => setMessage(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-label={item ? 'Edit testimonial' : 'New testimonial'}
      className="mt-4 flex flex-col gap-4 rounded-card border-2 border-line bg-surface p-4"
      data-testid="admin-testimonial-form"
    >
      <FormAlert message={message} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          label="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input label="Pet" value={pet} onChange={(e) => setPet(e.target.value)} required />
        <Select label="Rating" value={rating} onChange={(e) => setRating(e.target.value)}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} out of 5
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        label="Quote"
        rows={3}
        maxLength={400}
        value={quote}
        onChange={(e) => setQuote(e.target.value)}
        required
      />
      <Checkbox
        label="Featured on the homepage"
        checked={isFeatured}
        onChange={(e) => setIsFeatured(e.target.checked)}
      />
      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          {item ? 'Save testimonial' : 'Create testimonial'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
