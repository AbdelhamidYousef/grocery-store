import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from './api/health';

export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  let apiStatus = 'checking...';
  if (health.isError) apiStatus = 'down';
  else if (health.data) apiStatus = health.data.status;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Store</h1>
      <p data-testid="api-status">api: {apiStatus}</p>
    </main>
  );
}
