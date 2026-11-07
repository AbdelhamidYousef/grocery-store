import { useQuery } from '@tanstack/react-query';

import { fetchHome, fetchTestimonials } from '../../api/home';
import { keys } from '../../lib/query-client';

// Read hooks for the homepage sections (components never fetch themselves).

export function useHome() {
  return useQuery({ queryKey: keys.home.all, queryFn: ({ signal }) => fetchHome(signal) });
}

export function useTestimonials() {
  return useQuery({
    queryKey: keys.home.testimonials,
    queryFn: ({ signal }) => fetchTestimonials(signal),
  });
}
