import { MAX_PETS, type PetProfile } from '@store/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useT } from '../../i18n';
import { formErrorMessage } from '../auth/form-errors';

import { useActivePet } from './ActivePetProvider';
import { describeAge, speciesName } from './age';
import { PetForm } from './PetForm';
import { usePets } from './queries';

type Editing = { kind: 'new' } | { kind: 'edit'; pet: PetProfile } | null;

// /account/pets works without an account: a guest's pets live in this browser, and the page says
// so. (It is a public route for exactly that reason; see routes.tsx.)
export function PetsSection() {
  const { pets, loading, synced, atLimit, add, update, remove } = usePets();
  const { activePet, setActivePet } = useActivePet();
  const toast = useToast();
  const { t, tn, tm } = useT();
  const [params, setParams] = useSearchParams();
  // `?add=1` is how the header switcher's "Add a pet" opens the form on arrival.
  const [editing, setEditing] = useState<Editing>(
    params.get('add') === '1' ? { kind: 'new' } : null,
  );
  const [deleting, setDeleting] = useState<PetProfile | null>(null);

  const closeForm = () => {
    setEditing(null);
    if (params.has('add')) {
      const next = new URLSearchParams(params);
      next.delete('add');
      setParams(next, { replace: true });
    }
  };

  return (
    <section
      aria-labelledby="pets-heading"
      data-testid="account-pets"
      className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"
    >
      <Seo title={t('pets.title')} noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="pets-heading" className="font-display text-3xl font-bold">
          {t('pets.title')}
        </h1>
        <Button
          onClick={() => setEditing({ kind: 'new' })}
          disabled={atLimit}
          data-testid="pet-add"
        >
          {t('pets.add')}
        </Button>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        {t('pets.intro')}{' '}
        {synced ? (
          <Link to="/account" className="font-semibold text-primary-strong underline">
            {t('pets.backToAccount')}
          </Link>
        ) : (
          <>
            {t('pets.guestNote')}{' '}
            <Link
              to="/login?next=/account/pets"
              className="font-semibold text-primary-strong underline"
            >
              {t('pets.signIn')}
            </Link>{' '}
            {t('pets.signInRest')}
          </>
        )}
      </p>
      {atLimit && (
        <p role="status" data-testid="pets-limit" className="mt-2 font-semibold">
          {t('pets.limit', { max: MAX_PETS })}
        </p>
      )}

      {loading && <Skeleton className="mt-6 h-32 w-full rounded-card" />}
      {!loading && pets.length === 0 && (
        <p
          className="mt-6 rounded-card border border-dashed border-muted p-6 text-muted"
          data-testid="empty-state"
        >
          {t('pets.empty')}
        </p>
      )}
      {pets.length > 0 && (
        <ul className="mt-6 grid gap-4 md:grid-cols-2" data-testid="pet-list">
          {pets.map((pet) => {
            const age = describeAge(pet, new Date(), tn);
            const isActive = activePet?.id === pet.id;
            return (
              <li
                key={pet.id}
                data-testid="pet-card"
                className="flex min-w-0 flex-col gap-3 rounded-card border-2 border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 break-words font-display text-xl font-bold">{pet.name}</h2>
                  {isActive && <Badge tone="success">{t('pets.shoppingFor')}</Badge>}
                </div>
                <p className="text-muted">
                  {speciesName(t, pet.species)}
                  {age ? `, ${age}` : ''}
                  {pet.size ? t('pets.sizeSuffix', { size: pet.size.toUpperCase() }) : ''}
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={isActive ? 'ghost' : 'secondary'}
                    aria-pressed={isActive}
                    onClick={() => setActivePet(isActive ? null : pet)}
                  >
                    {isActive ? t('pets.stopShopping') : t('pets.shopFor')}
                    <span className="sr-only"> {pet.name}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing({ kind: 'edit', pet })}
                  >
                    {t('pets.edit')}
                    <span className="sr-only"> {pet.name}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => setDeleting(pet)}
                  >
                    {t('pets.delete')}
                    <span className="sr-only"> {pet.name}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={closeForm}
        title={editing?.kind === 'edit' ? t('pets.editTitle') : t('pets.add')}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {editing && (
          <PetForm
            key={editing.kind === 'edit' ? editing.pet.id : 'new'}
            {...(editing.kind === 'edit' ? { pet: editing.pet } : {})}
            onCancel={closeForm}
            onSave={async (input) => {
              if (editing.kind === 'edit') {
                await update(editing.pet.id, input);
                toast.show(t('pets.saved'), 'success');
              } else {
                const created = await add(input);
                // The first pet is the one you are shopping for; later ones wait to be picked.
                if (pets.length === 0) setActivePet(created);
                toast.show(t('pets.added', { name: created.name }), 'success');
              }
              closeForm();
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('pets.removeTitle')}
      >
        {deleting && (
          <>
            <p className="break-words">{t('pets.removeText', { name: deleting.name })}</p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                {t('pets.keep')}
              </Button>
              <Button
                variant="danger"
                data-testid="pet-delete-confirm"
                onClick={() =>
                  void remove(deleting.id).then(
                    () => {
                      toast.show(t('pets.removed'), 'success');
                      setDeleting(null);
                    },
                    (e: unknown) => toast.show(formErrorMessage(e, t, tm), 'error'),
                  )
                }
              >
                {t('pets.remove')}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </section>
  );
}
