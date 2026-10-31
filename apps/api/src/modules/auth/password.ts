import argon2 from 'argon2';

// argon2id (not bcrypt): it is memory-hard, so a GPU/ASIC farm gains little over a laptop, and the
// "id" variant resists both side-channel and GPU attacks. Parameters follow the OWASP minimum
// "memory 19 MiB / t=2" tier, raised: 64 MiB, 3 passes, 1 lane. That costs roughly 100-200 ms per
// hash on a small free-tier instance, which is invisible to a person and expensive to a cracker.
// Parallelism stays 1 because Render's free tier has a fraction of a CPU.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // KiB
  timeCost: 3,
  parallelism: 1,
} as const;

export function hash(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

// argon2 reads salt and parameters from the stored hash, so old hashes keep verifying after the
// parameters above are raised. A malformed hash (e.g. a factory placeholder) is "no match",
// never an exception, so a corrupt row cannot turn into a 500 that reveals the account exists.
export async function verify(storedHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

// A real hash made with the production parameters, computed once. Verifying against it when the
// email is unknown makes "no such user" cost the same time as "wrong password", so response
// timing does not reveal which emails are registered. The password inside is random and never
// stored anywhere, so no input can ever match it.
let dummyHash: Promise<string> | undefined;
export function verifyAgainstDummy(password: string): Promise<boolean> {
  dummyHash ??= hash(`dummy-${crypto.randomUUID()}`);
  return dummyHash.then((h) => verify(h, password));
}
