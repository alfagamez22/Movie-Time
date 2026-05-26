export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

type GoogleOAuthEnv = Record<string, string | undefined>;

function readEnvValue(env: GoogleOAuthEnv, ...names: string[]) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }

  return null;
}

export function getGoogleOAuthCredentials(env: GoogleOAuthEnv = process.env): GoogleOAuthCredentials | null {
  const clientId = readEnvValue(env, 'AUTH_GOOGLE_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_ID');
  const clientSecret = readEnvValue(env, 'AUTH_GOOGLE_SECRET', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_SECRET');

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}
