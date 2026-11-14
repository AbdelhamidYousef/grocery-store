import { zodResolver } from '@hookform/resolvers/zod';
import {
  MAX_REVIEW_PHOTO_BYTES,
  MAX_REVIEW_PHOTOS,
  reviewInputSchema,
  type ReviewInput,
} from '@store/shared';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';
import { applyFieldErrors, formErrorMessage } from '../auth/form-errors';

import { useSubmitReview } from './queries';

type FormValues = z.input<typeof reviewInputSchema>;
const FIELDS = [
  'rating',
  'title',
  'body',
  'petAgeMonths',
  'petWeightG',
  'sizePurchased',
  'wouldRecommend',
] as const;
const ACCEPT = 'image/jpeg,image/png,image/webp';

// The browser's check is a courtesy (instant feedback); the server re-checks the real bytes.
export function photoProblem(file: File): string | null {
  if (!ACCEPT.split(',').includes(file.type)) return `${file.name}: use a JPEG, PNG or WebP image`;
  if (file.size > MAX_REVIEW_PHOTO_BYTES) return `${file.name}: each photo can be at most 3 MB`;
  return null;
}

// kg typed by a person -> integer grams for the API. "4.5" -> 4500; empty stays empty.
export const kgToGrams = (v: unknown): unknown => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n =
    typeof v === 'string' || typeof v === 'number' ? Number(String(v).replace(',', '.')) : NaN;
  return Number.isFinite(n) ? Math.round(n * 1000) : v;
};

export function ReviewForm({
  slug,
  productId,
  productName,
  uploadsEnabled,
}: {
  slug: string;
  productId: string;
  productName: string;
  uploadsEnabled: boolean;
}) {
  const submit = useSubmitReview(slug, productId);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<FormValues, unknown, ReviewInput>({
    resolver: zodResolver(reviewInputSchema),
    defaultValues: { title: '', body: '', sizePurchased: '', wouldRecommend: true },
  });
  const rating = Number(useWatch({ control, name: 'rating' }) ?? 0);

  // Object URLs for the previews, revoked when the files change or the form goes away.
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function pick(list: FileList | null) {
    const chosen = [...(list ?? [])];
    const merged = [...photos, ...chosen];
    const problem = chosen.map(photoProblem).find((p) => p !== null);
    if (problem) {
      setPhotoError(problem);
      return;
    }
    if (merged.length > MAX_REVIEW_PHOTOS) {
      setPhotoError(`You can attach up to ${MAX_REVIEW_PHOTOS} photos`);
      return;
    }
    setPhotoError(null);
    setPhotos(merged);
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const form = new FormData();
    form.set('rating', String(values.rating));
    form.set('title', values.title);
    form.set('body', values.body);
    form.set('wouldRecommend', String(values.wouldRecommend));
    if (values.petAgeMonths !== undefined) form.set('petAgeMonths', String(values.petAgeMonths));
    if (values.petWeightG !== undefined) form.set('petWeightG', String(values.petWeightG));
    if (values.sizePurchased) form.set('sizePurchased', values.sizePurchased);
    for (const file of photos) form.append('photos', file);
    try {
      await submit.mutateAsync(form);
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) setFormError(formErrorMessage(error));
    }
  });

  if (submit.isSuccess) {
    return (
      <div
        role="status"
        data-testid={TEST_IDS.reviewPending}
        className="rounded-card border border-line bg-success-soft p-4"
      >
        <p className="font-display text-lg font-bold">
          Thank you! Your review is waiting for approval.
        </p>
        <p className="mt-1 text-sm">
          We check every review before it appears on the page, usually within a couple of days.
          {submit.data.verifiedBuyer
            ? ' It will carry a "Verified buyer" tag because you bought this product from us.'
            : ''}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      data-testid={TEST_IDS.reviewForm}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
    >
      <h3 className="font-display text-xl font-bold">Review {productName}</h3>
      <FormAlert message={formError} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-semibold">Your rating</legend>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className={cn(
                'flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-control border-2 px-3 font-display font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
                rating === n ? 'border-ink bg-ink text-surface' : 'border-line',
              )}
            >
              <input
                type="radio"
                value={n}
                aria-label={n === 1 ? '1 star' : `${n} stars`}
                className="sr-only"
                {...register('rating')}
              />
              <span aria-hidden="true">{n}</span>
              <span aria-hidden="true" className={rating >= n ? 'text-star' : ''}>
                &#9733;
              </span>
            </label>
          ))}
        </div>
        {errors.rating && (
          <p className="text-sm font-semibold text-danger">{errors.rating.message}</p>
        )}
      </fieldset>

      <Input label="Title" error={errors.title?.message} maxLength={80} {...register('title')} />
      <Textarea
        label="Your review"
        hint="What did you and your pet think? 20 to 2000 characters."
        error={errors.body?.message}
        {...register('body')}
      />
      <Checkbox label="I would recommend this product" {...register('wouldRecommend')} />

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold">About your pet (optional)</legend>
        <Input
          label="Pet age (months)"
          type="number"
          inputMode="numeric"
          min={0}
          max={600}
          error={errors.petAgeMonths?.message}
          {...register('petAgeMonths')}
        />
        <Input
          label="Pet weight (kg)"
          type="text"
          inputMode="decimal"
          error={errors.petWeightG?.message}
          {...register('petWeightG', { setValueAs: kgToGrams })}
        />
        <Input
          label="Size you bought"
          maxLength={40}
          error={errors.sizePurchased?.message}
          {...register('sizePurchased')}
        />
      </fieldset>

      {uploadsEnabled ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="review-photos" className="text-sm font-semibold">
            Photos (optional, up to {MAX_REVIEW_PHOTOS}, 3 MB each)
          </label>
          <input
            id="review-photos"
            type="file"
            accept={ACCEPT}
            multiple
            disabled={photos.length >= MAX_REVIEW_PHOTOS}
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
            className="text-sm"
          />
          {photoError && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {photoError}
            </p>
          )}
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Photos to upload">
              {photos.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex flex-col items-center gap-1">
                  <img
                    src={previews[i]}
                    alt={`Preview of ${file.name}`}
                    className="h-20 w-20 rounded-control border border-line object-cover"
                  />
                  <button
                    type="button"
                    className="text-xs font-semibold underline"
                    onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Photo upload is switched off in this demo.</p>
      )}

      <p className="text-sm text-muted">
        Reviews are checked before they appear. Please keep personal details out of them.
      </p>
      <div>
        <Button type="submit" loading={submit.isPending}>
          Submit review
        </Button>
      </div>
    </form>
  );
}
