// All HTTP calls live in src/api so components never fetch directly; that keeps a later SSR or
// prerender step possible and makes components trivial to test.
export interface HealthResponse {
  status: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/v1/health');
  if (!res.ok) {
    throw new Error(`health check failed with status ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
