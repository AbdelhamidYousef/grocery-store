import {
  HERO_SLIDE_COUNT,
  type AdminHomeContent,
  type HeroSlide,
  type PromoTile,
} from '@store/shared';
import { useState, type FormEvent } from 'react';

import { Seo } from '../../../components/Seo';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { useAdminHomeContent, useSaveHomeContent } from './queries';

export function HomeAdmin() {
  const { data, isPending, error, refetch } = useAdminHomeContent();
  return (
    <section aria-labelledby="home-heading" data-testid="admin-home">
      <Seo title="Admin homepage" noindex />
      <h2 id="home-heading" className="font-display text-xl font-bold">
        Homepage content
      </h2>
      {isPending && !error && <Skeleton className="mt-4 h-64 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the homepage content.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && (
        <div className="mt-4 flex flex-col gap-8">
          <HeroForm slides={data.heroSlides} />
          <PromoForm promo={data.promoTile} />
        </div>
      )}
    </section>
  );
}

type Draft = Record<keyof HeroSlide, string>;
const toDraft = (s: HeroSlide): Draft => ({ ...s, imageUrl: s.imageUrl ?? '' });
const EMPTY: Draft = { title: '', text: '', ctaLabel: '', ctaHref: '/', imageUrl: '' };

function HeroForm({ slides }: { slides: AdminHomeContent['heroSlides'] }) {
  const save = useSaveHomeContent();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(slides.map(toDraft));
  const [message, setMessage] = useState<string | null>(null);

  const edit = (i: number, key: keyof Draft, value: string) =>
    setDrafts((all) => all.map((d, n) => (n === i ? { ...d, [key]: value } : d)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    save.mutate(
      {
        key: 'hero_slides',
        value: drafts.map((d) => ({ ...d, imageUrl: d.imageUrl.trim() || null })),
      },
      {
        onSuccess: () => toast.show('Hero slides saved', 'success'),
        onError: (err) => setMessage(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-labelledby="hero-heading"
      className="flex flex-col gap-4"
      data-testid="admin-hero-form"
    >
      <h3 id="hero-heading" className="font-display text-lg font-bold">
        Hero slides
      </h3>
      <FormAlert message={message} />
      {drafts.map((d, i) => (
        <fieldset
          key={i}
          className="rounded-card border-2 border-line p-4"
          data-testid="hero-slide"
        >
          <legend className="px-2 font-semibold">Slide {i + 1}</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              value={d.title}
              onChange={(e) => edit(i, 'title', e.target.value)}
              required
            />
            <Input
              label="Button label"
              value={d.ctaLabel}
              onChange={(e) => edit(i, 'ctaLabel', e.target.value)}
              required
            />
            <Input
              label="Text"
              value={d.text}
              onChange={(e) => edit(i, 'text', e.target.value)}
              required
            />
            <Input
              label="Button link"
              hint="A path like /c/dogs or an https link."
              value={d.ctaHref}
              onChange={(e) => edit(i, 'ctaHref', e.target.value)}
              required
            />
            <Input
              label="Image URL (optional)"
              value={d.imageUrl}
              onChange={(e) => edit(i, 'imageUrl', e.target.value)}
            />
          </div>
          {drafts.length > 1 && (
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              aria-label={`Remove slide ${i + 1}`}
              onClick={() => setDrafts((all) => all.filter((_, n) => n !== i))}
            >
              Remove slide
            </Button>
          )}
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-3">
        {drafts.length < HERO_SLIDE_COUNT && (
          <Button variant="secondary" onClick={() => setDrafts((all) => [...all, { ...EMPTY }])}>
            Add slide
          </Button>
        )}
        <Button type="submit" loading={save.isPending}>
          Save hero slides
        </Button>
      </div>
    </form>
  );
}

function PromoForm({ promo }: { promo: PromoTile }) {
  const save = useSaveHomeContent();
  const toast = useToast();
  const [enabled, setEnabled] = useState(promo.enabled);
  const [text, setText] = useState(promo.text ?? '');
  const [linkLabel, setLinkLabel] = useState(promo.linkLabel ?? '');
  const [linkHref, setLinkHref] = useState(promo.linkHref ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    save.mutate(
      {
        key: 'promo_tile',
        value: {
          enabled,
          text: text.trim() || null,
          linkLabel: linkLabel.trim() || null,
          linkHref: linkHref.trim() || null,
        },
      },
      {
        onSuccess: () => toast.show('Promo tile saved', 'success'),
        onError: (err) => setMessage(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-labelledby="promo-heading"
      className="flex flex-col gap-4"
      data-testid="admin-promo-form"
    >
      <h3 id="promo-heading" className="font-display text-lg font-bold">
        Promo tile
      </h3>
      <FormAlert message={message} />
      <Checkbox
        label="Show the promo tile on the homepage"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Text" value={text} onChange={(e) => setText(e.target.value)} />
        <Input
          label="Link label"
          value={linkLabel}
          onChange={(e) => setLinkLabel(e.target.value)}
        />
        <Input
          label="Link"
          hint="A path like /c/cats or an https link."
          value={linkHref}
          onChange={(e) => setLinkHref(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit" loading={save.isPending}>
          Save promo tile
        </Button>
      </div>
    </form>
  );
}
