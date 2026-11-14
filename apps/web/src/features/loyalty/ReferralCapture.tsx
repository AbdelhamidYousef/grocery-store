import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { captureReferral } from './referral-cookie';

// Renders nothing: remembers `?ref=CODE` from whichever page the visitor lands on.
export function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => {
    if (search.includes('ref=')) captureReferral(search);
  }, [search]);
  return null;
}
