import {
  TRANSLATION_FIELDS,
  TRANSLATION_LOCALES,
  type EntityTranslations,
  type TranslationEntity,
  type TranslationLocale,
} from '@store/shared';
import { useState, type FormEvent } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Tabs } from '../../../components/ui/Tabs';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { adminErrorMessage } from '../errors';

import { useEntityTranslations, useSaveTranslation } from './queries';

const LOCALE_NAMES: Record<TranslationLocale, string> = { de: 'German' };
const LONG_FIELDS = new Set(['description', 'story', 'summary', 'bodyMd']);
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  title: 'Title',
  description: 'Description',
  tagline: 'Tagline',
  story: 'Story',
  summary: 'Summary',
  bodyMd: 'Body (Markdown)',
  slug: 'URL slug',
  metaTitle: 'Meta title',
  metaDescription: 'Meta description',
};

/** How many of the translatable fields of one language have text. */
export function completeness(entity: TranslationEntity, row: Record<string, string | null> | null) {
  const fields = TRANSLATION_FIELDS[entity];
  const done = fields.filter((f) => row?.[f]?.trim()).length;
  return { done, total: fields.length };
}

function LocaleForm({ data, locale }: { data: EntityTranslations; locale: TranslationLocale }) {
  const toast = useToast();
  const save = useSaveTranslation(data.entity, data.id);
  const fields = [...TRANSLATION_FIELDS[data.entity], 'slug', 'metaTitle', 'metaDescription'];
  const saved = data.locales[locale];
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, saved?.[f] ?? ''])),
  );
  const [error, setError] = useState<string | null>(null);

  const copyFromEnglish = () =>
    setForm((f) => ({
      ...f,
      ...Object.fromEntries(TRANSLATION_FIELDS[data.entity].map((k) => [k, data.english[k] ?? ''])),
    }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate(
      { locale, input: form },
      {
        onSuccess: () => toast.show(`${LOCALE_NAMES[locale]} saved`, 'success'),
        onError: (err) => setError(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      data-testid={`translation-form-${locale}`}
    >
      <p className="text-sm text-muted">
        Empty fields show the English text. English slug: <code>{data.english.slug}</code>
      </p>
      {fields.map((field) => {
        const common = {
          label: FIELD_LABELS[field] ?? field,
          value: form[field] ?? '',
          onChange: (e: { target: { value: string } }) =>
            setForm((f) => ({ ...f, [field]: e.target.value })),
          hint: data.english[field] ? `English: ${data.english[field]?.slice(0, 120)}` : undefined,
        };
        return LONG_FIELDS.has(field) ? (
          <Textarea key={field} {...common} rows={field === 'bodyMd' ? 12 : 4} />
        ) : (
          <Input key={field} {...common} />
        );
      })}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving' : `Save ${LOCALE_NAMES[locale]}`}
        </Button>
        <Button type="button" variant="secondary" onClick={copyFromEnglish}>
          Copy from English
        </Button>
      </div>
    </form>
  );
}

// Locale tabs for one catalogue entity. Each tab is its own form (state resets per language).
export function TranslationEditor({ entity, id }: { entity: TranslationEntity; id: string }) {
  const { data, isPending, error } = useEntityTranslations(entity, id);
  const [locale, setLocale] = useState<TranslationLocale>('de');
  if (isPending && !error) return <Skeleton className="h-48 w-full rounded-card" />;
  if (error || !data) {
    return (
      <p role="alert" className="text-danger">
        Could not load the translations.
      </p>
    );
  }
  return (
    <Tabs
      label="Languages"
      selectedId={locale}
      onSelect={(next) => setLocale(next as TranslationLocale)}
      tabs={TRANSLATION_LOCALES.map((l) => {
        const { done, total } = completeness(entity, data.locales[l]);
        return {
          id: l,
          label: `${LOCALE_NAMES[l]} (${done}/${total})`,
          // keyed by locale + saved state so a save refreshes the form
          panel: (
            <LocaleForm key={`${l}-${JSON.stringify(data.locales[l])}`} data={data} locale={l} />
          ),
        };
      })}
    />
  );
}
