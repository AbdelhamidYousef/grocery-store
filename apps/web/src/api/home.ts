import { HomeResponseSchema, TestimonialsResponseSchema } from '@store/shared';

import { apiFetch } from './client';

export async function fetchHome(signal?: AbortSignal) {
  return (await apiFetch('/home', { schema: HomeResponseSchema, ...(signal && { signal }) })).data;
}

export function fetchTestimonials(signal?: AbortSignal) {
  return apiFetch('/testimonials', {
    schema: TestimonialsResponseSchema,
    ...(signal && { signal }),
  });
}
