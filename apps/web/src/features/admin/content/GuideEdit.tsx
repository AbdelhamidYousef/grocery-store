import type { AdminGuide } from '@store/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../../../api/client';
import { Seo } from '../../../components/Seo';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { inputToIso, isoToInput } from './datetime';
import { MarkdownEditor } from './MarkdownEditor';
import { ProductPicker, type PickedProduct } from './ProductPicker';
import { useAdminGuide, useAdminGuides, useDeleteGuide, useSaveGuide } from './queries';

export function GuideEdit() {
  const { id } = useParams();
  const isNew = id === undefined;
  const { data: guide, isPending, error, refetch } = useAdminGuide(id);

  if (!isNew && isPending && !error) return <Skeleton className="h-64 w-full rounded-card" />;
  if (!isNew && (error || !guide)) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div role="alert">
        <p className="font-semibold text-danger">
          {missing ? 'That guide does not exist.' : 'We could not load this guide.'}
        </p>
        {!missing && (
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
        <Link to="/admin/guides" className="mt-2 block font-semibold text-primary-strong underline">
          Back to guides
        </Link>
      </div>
    );
  }
  // Keyed by id so moving between guides always starts a fresh form.
  return <GuideForm key={guide?.id ?? 'new'} guide={guide ?? null} />;
}

function GuideForm({ guide }: { guide: AdminGuide | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveGuide(guide?.id ?? null);
  const remove = useDeleteGuide();
  const { data: existing } = useAdminGuides();
  const [title, setTitle] = useState(guide?.title ?? '');
  const [slug, setSlug] = useState(guide?.slug ?? '');
  const [category, setCategory] = useState(guide?.category ?? '');
  const [summary, setSummary] = useState(guide?.summary ?? '');
  const [coverUrl, setCoverUrl] = useState(guide?.coverUrl ?? '');
  const [status, setStatus] = useState<'draft' | 'published'>(guide?.status ?? 'draft');
  const [publishedAt, setPublishedAt] = useState(isoToInput(guide?.publishedAt));
  const [bodyMd, setBodyMd] = useState(guide?.bodyMd ?? '');
  const [products, setProducts] = useState<PickedProduct[]>(guide?.products ?? []);
  const [message, setMessage] = useState<string | null>(null);

  const categories = [...new Set((existing ?? []).map((g) => g.category))];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    save.mutate(
      {
        title,
        slug,
        summary,
        bodyMd,
        category,
        coverUrl: coverUrl.trim() || null,
        status,
        publishedAt: inputToIso(publishedAt),
        productIds: products.map((p) => p.id),
      },
      {
        onSuccess: (saved) => {
          toast.show(guide ? 'Guide saved' : 'Guide created', 'success');
          if (!guide) void navigate(`/admin/guides/${saved.id}`, { replace: true });
        },
        onError: (err) => setMessage(adminErrorMessage(err)),
      },
    );
  };

  const confirmDelete = () => {
    if (!guide || !window.confirm(`Delete the guide "${guide.title}"? This cannot be undone.`))
      return;
    remove.mutate(guide.id, {
      onSuccess: () => {
        toast.show('Guide deleted', 'success');
        void navigate('/admin/guides');
      },
      onError: (err) => setMessage(adminErrorMessage(err)),
    });
  };

  return (
    <section aria-labelledby="guide-heading" data-testid="admin-guide-form">
      <Seo title={guide ? `Edit ${guide.title}` : 'New guide'} noindex />
      <Link to="/admin/guides" className="text-sm font-semibold text-primary-strong underline">
        Back to guides
      </Link>
      <h2 id="guide-heading" className="mt-2 font-display text-xl font-bold">
        {guide ? guide.title : 'New guide'}
      </h2>
      {guide?.status === 'published' && (
        <Link
          to={`/guides/${guide.slug}`}
          className="text-sm font-semibold text-primary-strong underline"
        >
          View in the shop
        </Link>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <FormAlert message={message} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input
            label="Slug"
            hint="Leave empty to make one from the title."
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Input
            label="Category"
            list="guide-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
          <datalist id="guide-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value === 'published' ? 'published' : 'draft')}
          >
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published</option>
          </Select>
          <Input
            label="Publish date (UTC)"
            type="datetime-local"
            hint="Empty means now. A future date schedules it."
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
          />
          <Input
            label="Cover image URL (optional)"
            hint="A path like /guides/cover.webp or an https link."
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
          />
        </div>
        <Textarea
          label="Summary"
          rows={2}
          maxLength={300}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
        />
        <MarkdownEditor label="Body" value={bodyMd} onChange={setBodyMd} />
        <ProductPicker label="Products mentioned" selected={products} onChange={setProducts} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={save.isPending}>
            {guide ? 'Save guide' : 'Create guide'}
          </Button>
          {guide && (
            <Button variant="danger" onClick={confirmDelete} loading={remove.isPending}>
              Delete guide
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
