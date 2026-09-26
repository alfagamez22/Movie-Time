const DEFAULT_ADMIN_EMAILS = 'harveybuan1234@gmail.com';

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS?.trim() || DEFAULT_ADMIN_EMAILS;
  return new Set(raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && adminEmails().has(email!.trim().toLowerCase());
}
