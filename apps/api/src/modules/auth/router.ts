import { Router as ExpressRouter, type Router } from 'express';

// Filled in by a later phase; mounted already so adding endpoints never touches app wiring.
export const authRouter: Router = ExpressRouter();
