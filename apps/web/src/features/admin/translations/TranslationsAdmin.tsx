import { TRANSLATION_LOCALES, type TranslationEntity, type TranslationLocale } from '@store/shared';
import { Link, useSearchParams } from 'react-router-dom';

import { Seo } from '../../../components/Seo';
import { Skeleton } from '../../../components/ui/Skeleton';

import { useMissingTranslations } from './queries';
import { TranslationEditor } from './TranslationEditor';

const ENTITY_LABELS: Record<TranslationEntity, string> = {
  product: 'Products',
  category: 'Categories',
  brand: 'Brands',
  collection: 'Collections',
  guide: 'Guides',
};
const ENTITIES = Object.keys(ENTITY_LABELS) as TranslationEntity[];
const isEntity = (v: string | null): v is TranslationEntity =>
  ENTITIES.includes(v as TranslationEntity);
const isLocale = (v: string | null): v is TranslationLocale =>
  TRANSLATION_LOCALES.includes(v as TranslationLocale);

// The completeness report per language (what is still English) and the editor for the entity in
// the URL (`?entity=brand&id=...`), which the product, guide, brand and collection screens link to.
// Not translated in v1 and shown in English: help articles, legal pages, specs, FAQs,
// reviews, testimonials, safety notices.
export function TranslationsAdmin() {
  const [params, setParams] = useSearchParams();
  const locale = isLocale(params.get('locale'))
    ? (params.get('locale') as TranslationLocale)
    : 'de';
  const entityParam = params.get('entity');
  const id = params.get('id');
  const { data, isPending, error } = useMissingTranslations(locale);

  const set = (next: Record<string, string | null>) => {
    const copy = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) copy.delete(k);
      else copy.set(k, v);
    }
    setParams(copy);
  };

  return (
    <section aria-labelledby="translations-heading" data-testid="admin-translations">
      <Seo title="Translations" noindex />
      <h1 id="translations-heading" className="font-display text-2xl font-bold">
        Translations
      </h1>
      <p className="mt-1 text-sm text-muted">
        English lives in each record; a language only needs the fields that differ. Help articles,
        legal pages, specs, FAQs, reviews, testimonials and safety notices stay in English.
      </p>
      <div className="mt-4 flex gap-2" role="group" aria-label="Language">
        {TRANSLATION_LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={l === locale}
            onClick={() => set({ locale: l })}
            className="min-h-11 rounded-control border-2 border-muted px-4 font-semibold aria-pressed:border-primary aria-pressed:bg-pet-soft"
          >
            {l === 'de' ? 'German' : 'French'}
          </button>
        ))}
      </div>

      {isEntity(entityParam) && id ? (
        <div className="mt-6" data-testid="translation-editor">
          <button
            type="button"
            className="text-sm font-semibold text-primary-strong underline"
            onClick={() => set({ entity: null, id: null })}
          >
            Back to the report
          </button>
          <div className="mt-3">
            <TranslationEditor entity={entityParam} id={id} />
          </div>
        </div>
      ) : isPending && !error ? (
        <Skeleton className="mt-6 h-48 w-full rounded-card" />
      ) : error || !data ? (
        <p role="alert" className="mt-6 text-danger">
          Could not load the report.
        </p>
      ) : (
        <div className="mt-6 grid gap-6">
          {data.entities.map((group) => (
            <div key={group.entity} data-testid={`translation-group-${group.entity}`}>
              <h2 className="font-display text-lg font-bold">
                {ENTITY_LABELS[group.entity]}{' '}
                <span className="rounded-full bg-pet-soft px-2 py-0.5 text-sm">
                  {group.complete}/{group.total} complete
                </span>
              </h2>
              {group.missing.length === 0 ? (
                <p className="text-sm text-muted">Everything is translated.</p>
              ) : (
                <ul className="mt-2 divide-y divide-muted/30 rounded-card border border-muted/40">
                  {group.missing.slice(0, 25).map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <Link
                        to={`/admin/translations?entity=${group.entity}&id=${item.id}&locale=${locale}`}
                        className="font-semibold text-primary-strong underline"
                      >
                        {item.label}
                      </Link>
                      <span className="text-sm text-muted">missing: {item.fields.join(', ')}</span>
                    </li>
                  ))}
                  {group.missing.length > 25 && (
                    <li className="px-3 py-2 text-sm text-muted">
                      and {group.missing.length - 25} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
