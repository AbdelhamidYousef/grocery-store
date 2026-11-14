import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useToast } from '../../components/ui/Toast';
import { keys } from '../../lib/query-client';

import { createCallLimiter } from './call-limit';
import { isAgentError } from './tools';
import { registerAgentTools } from './webmcp';

// Renders nothing. It connects the adapter (plain TypeScript) to the two things that live in
// React: the toast, so the human SEES every cart change an agent makes (silent mutation was
// rejected), and the query cache, so the header badge and cart page show the new cart at once.
export function AgentToolsBridge() {
  const toast = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const limiter = createCallLimiter();
    return registerAgentTools({
      guard: () => {
        const wait = limiter.take();
        return wait === 0
          ? null
          : {
              error: {
                code: 'RATE_LIMITED',
                message: `Too many tool calls. Wait ${wait} seconds and try again.`,
              },
            };
      },
      onCall: (tool, input, result) => {
        if (tool.readOnly || isAgentError(result)) return;
        void queryClient.invalidateQueries({ queryKey: keys.cart });
        const note = tool.describe(input, result);
        if (note) toast.show(note, 'info');
      },
    });
  }, [toast, queryClient]);

  return null;
}
