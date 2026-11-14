import type { AdminProduct } from '@store/shared';
import { useState } from 'react';

import { ApiError } from '../../../api/client';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import {
  formErrorsFromServer,
  toForm,
  toInput,
  type ContentForm,
  type FormErrors,
} from './content-form';
import { ConstituentsEditor } from './NumberEditors';
import { useAdminContent, useSaveContent } from './queries';
import { RelationsEditor } from './RelationsEditor';
import { FaqEditor, SpecsEditor } from './TextEditors';

type TabId = 'specs' | 'constituents' | 'faq' | 'size' | 'related';

// The "page content" half of the product screen: five editors in tabs, one Save for all of them
// (the API replaces the sections in one transaction, so there is no half-saved page).
export function ProductContent({ product }: { product: AdminProduct }) {
  const { data: content, isPending, isError, refetch } = useAdminContent(product.id);
  if (isPending) return <Skeleton className="h-48 w-full rounded-card" />;
  if (isError) {
    return (
      <div role="alert" className="text-danger">
        We could not load the page content.{' '}
        <Button variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  // Keyed by the content so a save (new server copy) starts the form from what is stored.
  return (
    <ContentEditor key={JSON.stringify(content)} product={product} initial={toForm(content)} />
  );
}

function ContentEditor({ product, initial }: { product: AdminProduct; initial: ContentForm }) {
  const toast = useToast();
  const save = useSaveContent(product.id);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('specs');

  const variantNames = Object.fromEntries(product.variants.map((v) => [v.id, v.name]));

  const submit = () => {
    setAlert(null);
    const { input, errors: found } = toInput(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setAlert('Some fields need attention. They are marked in the tabs.');
      return;
    }
    save.mutate(input, {
      onSuccess: () => toast.show('Page content saved', 'success'),
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
          const details = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
          setErrors(formErrorsFromServer(details?.fieldErrors ?? {}));
        }
        setAlert(adminErrorMessage(err));
      },
    });
  };

  // Which tabs hold an error, so the person is not left hunting.
  const tabHasError = (prefix: string) => Object.keys(errors).some((k) => k.startsWith(prefix));
  const mark = (label: string, prefix: string) =>
    tabHasError(prefix) ? `${label} (needs attention)` : label;

  return (
    <section
      aria-labelledby="content-heading"
      data-testid="product-content"
      className="flex flex-col gap-4 rounded-card border border-line p-4"
    >
      <h3 id="content-heading" className="font-display text-lg font-bold">
        Product page content
      </h3>
      <FormAlert message={alert} />
      <Tabs
        label="Product page content"
        selectedId={tab}
        onSelect={(id) => setTab(id as TabId)}
        tabs={[
          {
            id: 'specs',
            label: mark('Specs', 'specs.'),
            panel: <SpecsEditor form={form} errors={errors} onChange={setForm} />,
          },
          {
            id: 'constituents',
            label: mark('Constituents', 'constituents.'),
            panel: (
              <ConstituentsEditor
                form={form}
                errors={errors}
                onChange={setForm}
                variantNames={variantNames}
              />
            ),
          },
          {
            id: 'faq',
            label: mark('FAQ', 'faqs.'),
            panel: <FaqEditor form={form} errors={errors} onChange={setForm} />,
          },
          {
            id: 'related',
            label: 'Recommendations',
            panel: <RelationsEditor productId={product.id} form={form} onChange={setForm} />,
          },
          {
            id: 'size',
            label: 'Delivery',
            panel: (
              <div className="flex flex-col gap-4">
                <Input
                  label="Delivery note (optional)"
                  hint="Shown in the Delivery & returns tab, next to the shared policy."
                  maxLength={300}
                  value={form.deliveryNote}
                  onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })}
                />
              </div>
            ),
          },
        ]}
      />
      <div>
        <Button type="button" loading={save.isPending} onClick={submit}>
          Save page content
        </Button>
      </div>
    </section>
  );
}
