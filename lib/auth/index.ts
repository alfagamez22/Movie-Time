import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { authConfig } from './config';
import { CouchbaseAdapter } from './couchbase-adapter';
import { getGoogleOAuthCredentials } from './oauth';

const googleCredentials = getGoogleOAuthCredentials();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: CouchbaseAdapter(),
  providers: googleCredentials
    ? [
        Google({
          ...googleCredentials,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : [],
});
