import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { ToastProvider } from './components/ui/Toast';
import { registerAgentTools } from './features/agent/webmcp';
import { AuthProvider } from './features/auth/AuthProvider';
import { ActivePetProvider } from './features/pets/ActivePetProvider';
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
          <ActivePetProvider>
            <RouterProvider router={router} />
          </ActivePetProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Offer the shop's tools to in-browser AI agents when the browser supports WebMCP; otherwise this
// does nothing (it unregisters itself on pagehide).
registerAgentTools();
