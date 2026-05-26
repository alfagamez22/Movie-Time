export const BOOKMARK_STATUSES = ['favorite', 'watched', 'plan_to_watch'] as const;

export type BookmarkStatus = (typeof BOOKMARK_STATUSES)[number];

export const BOOKMARK_STATUS_LABELS: Record<BookmarkStatus, string> = {
  favorite: 'Favorite',
  watched: 'Completed',
  plan_to_watch: 'Plan to Watch',
};

export type AuthPromptReason = 'default' | 'bookmark' | 'comment';

interface AuthPromptCopy {
  title: string;
  description: string;
}

const AUTH_PROMPT_COPY: Record<AuthPromptReason, AuthPromptCopy> = {
  default: {
    title: 'Sign in to PapiFlix',
    description: 'Log in or create an account to keep your profile, watch history, bookmarks, and comments synced.',
  },
  bookmark: {
    title: 'Sign in to bookmark shows',
    description: 'Log in or create an account to bookmark your favorite shows and manage your watch list.',
  },
  comment: {
    title: 'Sign in to comment',
    description: 'Log in or create an account to comment on films and shows with your profile.',
  },
};

export const COMMENT_MAX_LENGTH = 1000;

export type CommentValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function isBookmarkStatus(status: unknown): status is BookmarkStatus {
  return typeof status === 'string' && BOOKMARK_STATUSES.includes(status as BookmarkStatus);
}

export function getAuthPromptCopy(reason: AuthPromptReason): AuthPromptCopy {
  return AUTH_PROMPT_COPY[reason];
}

export function validateCommentBody(input: unknown): CommentValidationResult {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Write a comment before posting.' };
  }

  const value = input.trim();
  if (!value) {
    return { ok: false, error: 'Write a comment before posting.' };
  }

  if (value.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: 'Keep comments under 1000 characters.' };
  }

  return { ok: true, value };
}
