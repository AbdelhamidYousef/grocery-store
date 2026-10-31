import type { Router } from 'express';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

export interface RouteInfo {
  // No `put`: the API uses PATCH for updates (see the contract).
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
}

// Lists every route registered on a router, nested sub-routers included, by reading Express's own
// layer stack. Tests use it so that "every admin route is guarded" covers routes added LATER too:
// there is no hand-kept list to forget to update. Relies on sub-routers being mounted at the root
// of their parent (the admin module's convention), so a nested route's `path` is its full path.
export function listRoutes(router: Router): RouteInfo[] {
  const out: RouteInfo[] = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          out.push({ method: method as RouteInfo['method'], path: layer.route.path });
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((router as unknown as { stack: Layer[] }).stack);
  return out;
}
