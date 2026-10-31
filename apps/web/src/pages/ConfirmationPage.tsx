import { useParams } from 'react-router-dom';

import { Confirmation } from '../features/checkout/Confirmation';

export default function ConfirmationPage() {
  const { number = '' } = useParams();
  // Keyed by the number so a different order never inherits the previous one's polling clock.
  return <Confirmation key={number} number={number} />;
}
