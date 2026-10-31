import { z } from 'zod';

import { DataSchema } from './common.ts';

// NIST SP 800-63B: length matters, composition rules ("one capital, one symbol") do not; they push
// people to "Password1!". So: a minimum length plus a block-list of passwords that attackers try
// first. Only passwords that are 10+ characters can matter here, shorter ones fail the length rule.
// Compared in lower case. A small list, not a breach database: it catches the laziest choices.
const COMMON_PASSWORDS = new Set([
  '0123456789',
  '1234567890',
  '12345678910',
  '123456789012',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  '1111111111',
  '2222222222',
  '0000000000',
  'qwertyuiop',
  'qwertyuiop123',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'asdfghjkl1',
  'asdfghjklqwerty',
  'zxcvbnm123',
  'password12',
  'password123',
  'password1234',
  'password12345',
  'password123456',
  'password1234567',
  'password!23',
  'passw0rd123',
  'p@ssword123',
  'p@ssw0rd123',
  'letmein123',
  'letmein1234',
  'welcome123',
  'welcome1234',
  'welcome12345',
  'iloveyou123',
  'iloveyou12',
  'iloveyou1234',
  'admin12345',
  'admin123456',
  'administrator',
  'abc1234567',
  'abcdefghij',
  'abcdefg123',
  'abcd123456',
  'trustno1234',
  'monkey1234',
  'monkey12345',
  'dragon12345',
  'football123',
  'baseball123',
  'superman123',
  'sunshine123',
  'princess123',
  'starwars123',
  'changeme123',
  'changeme12',
  'whatever123',
  'mypassword',
  'mypassword1',
  'mypassword123',
  'yourpassword',
  'testtest12',
  'test123456',
  'test1234567',
  'login12345',
  'master12345',
  'hello12345',
  'hello123456',
  'pawsome123',
  'pawsome1234',
  'ilovemydog',
  'ilovemycat',
  'ilovemydog1',
  'ilovemycat1',
]);

export const PASSWORD_MIN_LENGTH = 10;
// Upper bound so nobody can make the server hash a megabyte; far above any passphrase.
export const PASSWORD_MAX_LENGTH = 128;

export const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), 'This password is too common');

// Trim and lower-case here so "  Sam@Example.com " and "sam@example.com" are one account on the
// way in (the column is citext anyway). Mirrors what the auth rate limiter does to its key.
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

const NameSchema = z.string().trim().min(1, 'Required').max(80);

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: NewPasswordSchema,
  firstName: NameSchema,
  lastName: NameSchema,
});
export type RegisterInput = z.input<typeof RegisterSchema>;

// Login deliberately has no strength rules: it must accept whatever password already exists.
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Required').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.input<typeof LoginSchema>;

// What the API ever says about a user. Strict on purpose: `respond()` validates outgoing bodies in
// development and tests, so a stray `passwordHash` (or any new column) in a response fails loudly
// there instead of shipping. The session query also selects explicit columns (see getSession).
export const UserSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['customer', 'admin']),
});
export type User = z.infer<typeof UserSchema>;

export const UserResponseSchema = DataSchema(z.object({ user: UserSchema }));
export type UserResponse = z.infer<typeof UserResponseSchema>;
