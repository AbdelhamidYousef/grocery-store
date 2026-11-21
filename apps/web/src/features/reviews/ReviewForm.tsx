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
import { lookupFor, useT, type TFunction } from '../../i18n';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';
import { applyFieldErrors, formErrorMessage } from '../auth/form-errors';

import { useSubmitReview } from './queries';

type FormValues = z.input<typeof reviewInputSchema>;
const FIELDS = ['rating', 'title', 'body', 'wouldRecommend'] as const;
const ACCEPT = 'image/jpeg,image/png,image/webp';

// The browser's check is a courtesy (instant feedback); the server re-checks the real bytes.
// `t` defaults to the English words so the check can be called without a component.
export function photoProblem(
  file: File,
  t: TFunction = (key, params) => lookupFor('en-IE').t(key, params),
): string | null {
  if (!ACCEPT.split(',').includes(file.type))
    return t('reviews.form.photoType', { name: file.name });
  if (file.size > MAX_REVIEW_PHOTO_BYTES) return t('reviews.form.photoSize', { name: file.name });
  return null;
}

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
  const { t, tn, tm } = useT();
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
    defaultValues: { title: '', body: '', wouldRecommend: true },
  });
  const rating = Number(useWatch({ control, name: 'rating' }) ?? 0);

  // Object URLs for the previews, revoked when the files change or the form goes away.
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function pick(list: FileList | null) {
    const chosen = [...(list ?? [])];
    const merged = [...photos, ...chosen];
    const problem = chosen.map((f) => photoProblem(f, t)).find((p) => p !== null);
    if (problem) {
      setPhotoError(problem);
      return;
    }
    if (merged.length > MAX_REVIEW_PHOTOS) {
      setPhotoError(t('reviews.form.photoMax', { max: MAX_REVIEW_PHOTOS }));
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
    for (const file of photos) form.append('photos', file);
    try {
      await submit.mutateAsync(form);
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) setFormError(formErrorMessage(error, t, tm));
    }
  });

  if (submit.isSuccess) {
    return (
      <div
        role="status"
        data-testid={TEST_IDS.reviewPending}
        className="rounded-card border border-line bg-success-soft p-4"
      >
        <p className="font-display text-lg font-bold">{t('reviews.form.thanks')}</p>
        <p className="mt-1 text-sm">
          {t('reviews.form.thanksNote')}
          {submit.data.verifiedBuyer ? ` ${t('reviews.form.thanksVerified')}` : ''}
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
      <h3 className="font-display text-xl font-bold">
        {t('reviews.form.title', { name: productName })}
      </h3>
      <FormAlert message={formError} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-semibold">{t('reviews.form.rating')}</legend>
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
                aria-label={tn('reviews.stars', n)}
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
          <p className="text-sm font-semibold text-danger">{tm(errors.rating.message ?? '')}</p>
        )}
      </fieldset>

      <Input
        label={t('reviews.form.titleLabel')}
        error={errors.title?.message}
        maxLength={80}
        {...register('title')}
      />
      <Textarea
        label={t('reviews.form.bodyLabel')}
        hint={t('reviews.form.bodyHint')}
        error={errors.body?.message}
        {...register('body')}
      />
      <Checkbox label={t('reviews.form.recommend')} {...register('wouldRecommend')} />

      {uploadsEnabled ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="review-photos" className="text-sm font-semibold">
            {t('reviews.form.photosLabel', { max: MAX_REVIEW_PHOTOS })}
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
            <ul className="flex flex-wrap gap-2" aria-label={t('reviews.form.photosToUpload')}>
              {photos.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex flex-col items-center gap-1">
                  <img
                    src={previews[i]}
                    alt={t('reviews.form.photoPreview', { name: file.name })}
                    className="h-20 w-20 rounded-control border border-line object-cover"
                  />
                  <button
                    type="button"
                    className="text-xs font-semibold underline"
                    onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                  >
                    {t('reviews.form.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{t('reviews.form.uploadsOff')}</p>
      )}

      <p className="text-sm text-muted">{t('reviews.form.note')}</p>
      <div>
        <Button type="submit" loading={submit.isPending}>
          {t('reviews.form.submit')}
        </Button>
      </div>
    </form>
  );
}
