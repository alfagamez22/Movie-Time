import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/db';

type RegisterCredentialsInput = {
  email?: string;
  password?: string;
  name?: string;
} | null;

type RegisterCredentialsResult =
  | { ok: true }
  | { ok: false; status: 400 | 409; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerCredentialsUser(
  input: RegisterCredentialsInput,
): Promise<RegisterCredentialsResult> {
  if (!input?.email || !input.password) {
    return { ok: false, status: 400, error: 'Email and password are required.' };
  }

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, status: 400, error: 'Invalid email address.' };
  }

  if (input.password.length < 8) {
    return { ok: false, status: 400, error: 'Password must be at least 8 characters.' };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, status: 409, error: 'An account with this email already exists.' };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.user.create({
    data: { email, name: input.name?.trim() || null, passwordHash },
  });

  return { ok: true };
}
