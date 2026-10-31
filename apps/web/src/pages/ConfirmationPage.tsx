import { useParams } from 'react-router-dom';

import { PagePlaceholder } from './PagePlaceholder';

export default function ConfirmationPage() {
  const { number } = useParams();
  return (
    <PagePlaceholder
      title="Thank you for your order"
      note={`Order ${number ?? ''}: the confirmation page arrives in phase 8.`}
      testId="page-confirmation"
    />
  );
}
