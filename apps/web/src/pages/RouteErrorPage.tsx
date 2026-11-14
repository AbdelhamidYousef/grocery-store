import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { useT } from '../i18n';

// Rendered by the router's errorElement when a route throws while loading or rendering.
// Without it React unmounts the whole app to a blank page. In a data router a 404 response
// thrown by a loader also lands here, hence the status check.
export default function RouteErrorPage() {
  const { t } = useT();
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <Container className="py-16 text-center" data-testid="page-error">
      <Seo title={t('shell.error.title')} noindex />
      <h1 className="text-3xl font-bold">
        {notFound ? t('shell.error.notFoundHeading') : t('shell.error.title')}
      </h1>
      <p className="mt-3 text-muted" role="alert">
        {notFound ? t('shell.error.notFoundText') : t('shell.error.text')}
      </p>
      <Link
        to="/"
        reloadDocument
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-display font-semibold text-surface hover:bg-primary-hover"
      >
        {t('shell.error.reload')}
      </Link>
    </Container>
  );
}
