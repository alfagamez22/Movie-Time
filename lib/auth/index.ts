import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

import { prisma } from '@/lib/db';

import { authConfig } from './config';
import { getGoogleOAuthCredentials } from './oauth';

const googleCredentials = getGoogleOAuthCredentials();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (typeof credentials.email !== 'string' || typeof credentials.password !== 'string') {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    ...(googleCredentials
      ? [
          Google({
            ...googleCredentials,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
});
