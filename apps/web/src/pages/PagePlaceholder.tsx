import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';

// Stand-in body for routes whose real page arrives in a later phase. It already renders inside
// the layout, so the shell can be navigated end to end.
export function PagePlaceholder({
  title,
  note,
  testId,
}: {
  title: string;
  note: string;
  testId: string;
}) {
  return (
    <Container className="py-10" data-testid={testId}>
      <Seo title={title} noindex />
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-prose text-muted">{note}</p>
    </Container>
  );
}
