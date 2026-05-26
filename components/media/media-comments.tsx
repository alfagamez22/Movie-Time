'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MessageCircle, Send } from 'lucide-react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import type { LibraryMediaEntry } from '@/lib/media/types';
import { COMMENT_MAX_LENGTH, validateCommentBody } from '@/lib/media/user-actions';

interface MediaCommentRecord {
  body: string;
  createdAt: string;
  id: string;
  ownedByViewer: boolean;
  updatedAt: string;
  user: {
    id: string;
    image: string | null;
    name: string;
  };
}

interface CommentsResponse {
  comments?: MediaCommentRecord[];
  error?: string;
}

interface CreateCommentResponse {
  comment?: MediaCommentRecord;
  error?: string;
}

interface CommentState {
  comments: MediaCommentRecord[];
  error: string;
  key: string;
  loading: boolean;
}

interface DraftState {
  key: string;
  value: string;
}

interface MediaCommentsProps {
  entry: LibraryMediaEntry;
  experience: MediaExperienceConfig;
  onSignInRequired?: () => void;
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'PF'
  );
}

function formatCommentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function MediaComments({ entry, experience, onSignInRequired }: MediaCommentsProps) {
  const { data: session } = useSession();
  const [posting, setPosting] = useState(false);
  const mediaKey = `${entry.provider}:${entry.type}:${entry.id}`;
  const [commentState, setCommentState] = useState<CommentState>(() => ({
    comments: [],
    error: '',
    key: mediaKey,
    loading: true,
  }));
  const [draftState, setDraftState] = useState<DraftState>(() => ({ key: mediaKey, value: '' }));
  const comments = commentState.key === mediaKey ? commentState.comments : [];
  const error = commentState.key === mediaKey ? commentState.error : '';
  const loading = commentState.key !== mediaKey || commentState.loading;
  const draft = draftState.key === mediaKey ? draftState.value : '';
  const remaining = COMMENT_MAX_LENGTH - draft.length;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      mediaId: entry.id,
      mediaProvider: entry.provider,
      mediaType: entry.type,
    });

    void fetch(`/api/comments?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as CommentsResponse | null;
        if (controller.signal.aborted) return;
        if (!res.ok) {
          throw new Error(json?.error ?? 'Could not load comments.');
        }
        setCommentState({
          comments: json?.comments ?? [],
          error: '',
          key: mediaKey,
          loading: false,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setCommentState({
            comments: [],
            error: err instanceof Error ? err.message : 'Could not load comments.',
            key: mediaKey,
            loading: false,
          });
        }
      });

    return () => controller.abort(new DOMException('Comments request changed', 'AbortError'));
  }, [entry.id, entry.provider, entry.type, mediaKey]);

  const submitComment = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!session?.user) {
        onSignInRequired?.();
        return;
      }

      const validation = validateCommentBody(draft);
      if (!validation.ok) {
        setCommentState((prev) => ({
          comments: prev.key === mediaKey ? prev.comments : [],
          error: validation.error,
          key: mediaKey,
          loading: false,
        }));
        return;
      }

      setPosting(true);
      setCommentState((prev) => ({
        comments: prev.key === mediaKey ? prev.comments : [],
        error: '',
        key: mediaKey,
        loading: false,
      }));
      try {
        const res = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: validation.value,
            experience: experience.id,
            mediaId: entry.id,
            mediaProvider: entry.provider,
            mediaType: entry.type,
            title: entry.title,
          }),
        });
        const json = (await res.json().catch(() => null)) as CreateCommentResponse | null;

        if (res.status === 401) {
          onSignInRequired?.();
          return;
        }

        if (!res.ok || !json?.comment) {
          throw new Error(json?.error ?? 'Could not post comment.');
        }

        setCommentState((prev) => ({
          comments: [json.comment!, ...(prev.key === mediaKey ? prev.comments : [])],
          error: '',
          key: mediaKey,
          loading: false,
        }));
        setDraftState({ key: mediaKey, value: '' });
      } catch (err: unknown) {
        setCommentState((prev) => ({
          comments: prev.key === mediaKey ? prev.comments : [],
          error: err instanceof Error ? err.message : 'Could not post comment.',
          key: mediaKey,
          loading: false,
        }));
      } finally {
        setPosting(false);
      }
    },
    [draft, entry, experience.id, mediaKey, onSignInRequired, session?.user],
  );

  const countLabel = useMemo(() => {
    if (comments.length === 1) return '1 comment';
    return `${comments.length} comments`;
  }, [comments.length]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">Comments</h3>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{countLabel}</span>
      </div>

      {session?.user ? (
        <form onSubmit={submitComment} className="mb-5">
          <textarea
            value={draft}
            onChange={(event) => setDraftState({ key: mediaKey, value: event.target.value })}
            placeholder={`Share your thoughts on ${entry.title}`}
            rows={3}
            maxLength={COMMENT_MAX_LENGTH + 1}
            className="thin-scrollbar min-h-24 w-full resize-y rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3 text-sm leading-relaxed text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className={`text-xs ${remaining < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
              {remaining} characters left
            </span>
            <button
              type="submit"
              disabled={posting}
              className="inline-flex items-center gap-2 rounded-md bg-netflix-red px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-300">
              <MessageCircle className="h-4 w-4" />
            </span>
            <p className="text-sm text-zinc-300">Log in or create an account to comment on this title.</p>
          </div>
          <button
            type="button"
            onClick={onSignInRequired}
            className="rounded-md bg-white px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-zinc-200"
          >
            Sign In
          </button>
        </div>
      )}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-zinc-500">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-lg border border-white/10 bg-white/[0.025] px-4 py-3">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-black text-zinc-200">
                  {getInitials(comment.user.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {comment.user.name}
                    {comment.ownedByViewer ? <span className="ml-2 text-xs font-medium text-amber-400">You</span> : null}
                  </p>
                  <p className="text-xs text-zinc-500">{formatCommentDate(comment.createdAt)}</p>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{comment.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
