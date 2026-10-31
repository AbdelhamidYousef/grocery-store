import { Router as ExpressRouter, type Router } from 'express';

// Filled in by a later phase; mounted already so adding endpoints never touches app wiring.
export const cartRouter: Router = ExpressRouter();
