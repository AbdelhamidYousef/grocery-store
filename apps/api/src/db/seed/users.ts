import argon2 from 'argon2';

// Obviously fake `.test` addresses (a reserved TLD that can never receive real mail) and one
// shared demo password, printed by the seed script. Only the hash is stored.
export const DEMO_PASSWORD = 'Pawsome-demo-1!';

export const demoUsers = [
  { email: 'admin@pawsome.test', firstName: 'Ada', lastName: 'Admin', role: 'admin' as const },
  { email: 'sam@pawsome.test', firstName: 'Sam', lastName: 'Shopper', role: 'customer' as const },
  { email: 'riley@pawsome.test', firstName: 'Riley', lastName: 'Buyer', role: 'customer' as const },
];

export async function hashDemoPassword(): Promise<string> {
  // argon2id with the library defaults: memory-hard, so stolen hashes are expensive to crack.
  return argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
}
