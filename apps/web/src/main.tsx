import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { ToastProvider } from './components/ui/Toast';
import { AgentToolsBridge } from './features/agent/AgentToolsBridge';
import { AuthProvider } from './features/auth/AuthProvider';
import { createQueryClient } from './lib/query-client';
import { createAppRouter } from './routes';
import './styles/globals.css';

const queryClient = createQueryClient();
const router = createAppRouter();

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          {/* Offers the shop's tools to in-browser AI agents (WebMCP); does nothing without it. */}
          <AgentToolsBridge />
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
