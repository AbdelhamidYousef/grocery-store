import { Link } from 'react-router-dom';

import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button, buttonClasses } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { TEST_IDS } from '../../../lib/test-ids';
import { formatWhen } from '../order-status';

import { useAdminGuides } from './queries';

export function GuidesList() {
  const { data, isPending, error, refetch } = useAdminGuides();
  return (
    <section aria-labelledby="guides-heading" data-testid="admin-guides">
      <Seo title="Admin guides" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="guides-heading" className="font-display text-xl font-bold">
          Guides
        </h2>
        <Link to="/admin/guides/new" className={buttonClasses('primary', 'md')}>
          New guide
        </Link>
      </div>
      {isPending && !error && <Skeleton className="mt-4 h-48 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the guides.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="mt-4 text-muted" data-testid={TEST_IDS.adminEmpty}>
          No guides yet.
        </p>
      )}
      {data && data.length > 0 && (
        <div className="relative mt-4 overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[34rem] text-left" data-testid={TEST_IDS.adminTable}>
            <caption className="sr-only">Guides</caption>
            <thead className="bg-pet-soft">
              <tr>
                <th scope="col" className="p-3">
                  Title
                </th>
                <th scope="col" className="p-3">
                  Category
                </th>
                <th scope="col" className="p-3">
                  Status
                </th>
                <th scope="col" className="p-3">
                  Published
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.id} className="border-t border-line" data-testid={TEST_IDS.adminRow}>
                  <td className="p-3">
                    <Link
                      to={`/admin/guides/${g.id}`}
                      className="font-semibold text-primary-strong underline"
                    >
                      {g.title}
                    </Link>
                  </td>
                  <td className="p-3">{g.category}</td>
                  <td className="p-3">
                    <Badge tone={g.status === 'published' ? 'success' : 'neutral'}>
                      {g.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {g.publishedAt ? formatWhen(g.publishedAt) : 'Not published'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
