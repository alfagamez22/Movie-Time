'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { Info, LoaderCircle, X } from 'lucide-react';
import { AuthModal } from '@/components/auth/auth-modal';
import { cleanFeedbackText, feedbackTitleError, FEEDBACK_CATEGORIES } from '@/lib/feedback/validation';

export function FeedbackButton() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const titleError = attempted ? feedbackTitleError(title) : '';
  const categoryError = attempted && !FEEDBACK_CATEGORIES.some((item) => item === category) ? 'Choose a category.' : '';
  const titleInput = useRef<HTMLInputElement>(null);
  const categoryInput = useRef<HTMLSelectElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const button = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('button, input')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea')];
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); (previous ?? button)?.focus(); };
  }, [open, session]);
  const close = () => setOpen(false);
  return <>
    <button ref={trigger} type="button" onClick={() => { setOpen(true); setMessage(''); setSuccess(false); setAttempted(false); }} title="Share suggestions or report a problem to help improve PapiFlix." aria-label="Submit a Feedback — share suggestions or report a problem" className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/15 px-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white">
      <span className="hidden lg:inline">Submit a Feedback</span><Info className="h-3.5 w-3.5" />
    </button>
    {open && !session?.user && status !== 'loading' ? createPortal(<AuthModal onClose={close} title="Sign in to provide feedback" description="You must be signed in to share feedback. Sign in with Google, then open Submit a Feedback to send your suggestion." />, document.body) : null}
    {open && session?.user ? createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-6 text-white shadow-2xl">
        <button type="button" onClick={close} aria-label="Close feedback" className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
        <h2 id="feedback-title" className="pr-10 text-xl font-bold">Help us improve</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">What would make PapiFlix better for you? Share an idea, tell us what feels confusing, or report something that isn’t working. Please avoid sharing passwords or sensitive information.</p>
        {success ? <div className="mt-6"><p role="status">Thanks! Your feedback has been submitted.</p><button type="button" onClick={close} className="mt-4 rounded-lg bg-red-600 px-4 py-2 font-semibold">Done</button></div> : <form noValidate className="mt-5 space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setAttempted(true);
          setMessage('');
          if (feedbackTitleError(title)) { titleInput.current?.focus(); return; }
          if (!FEEDBACK_CATEGORIES.some((item) => item === category)) { categoryInput.current?.focus(); return; }
          setBusy(true);
          try {
            const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, category }) });
            const result = await response.json();
            if (!response.ok) { setMessage(result.error ?? 'Could not submit feedback.'); return; }
            setSuccess(true); setTitle(''); setDescription(''); setCategory('');
          } catch { setMessage('Could not submit feedback. Please try again.'); } finally { setBusy(false); }
        }}>
          <div>
            <label htmlFor="feedback-category" className="block text-sm font-medium text-zinc-200">Category</label>
            <select ref={categoryInput} id="feedback-category" aria-required="true" aria-invalid={Boolean(categoryError)} aria-describedby={categoryError ? 'feedback-category-error' : undefined} value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1.5 w-full rounded-lg border bg-zinc-950 p-3 text-sm transition-colors focus:outline-none focus:ring-2 ${categoryError ? 'border-red-500/70 focus:ring-red-500/30' : 'border-white/15 focus:ring-white/20'}`}><option value="" disabled>Choose a category</option>{FEEDBACK_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
            {categoryError ? <p id="feedback-category-error" role="alert" className="mt-1.5 text-xs text-red-400">{categoryError}</p> : null}
          </div>
          <div>
            <label htmlFor="feedback-subject" className="block text-sm font-medium text-zinc-200">Title {titleError ? <span aria-hidden="true" className="text-red-400">*</span> : null}</label>
            <input ref={titleInput} id="feedback-subject" aria-required="true" aria-invalid={Boolean(titleError)} aria-describedby={`feedback-title-count${titleError ? ' feedback-title-error' : ''}`} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value.replace(/\s{2,}/gu, ' ').replace(/^\s+/u, ''))} onBlur={() => setTitle(cleanFeedbackText(title))} placeholder="A short summary of your feedback" className={`mt-1.5 w-full rounded-lg border bg-zinc-950 p-3 text-sm transition-colors focus:outline-none focus:ring-2 ${titleError ? 'border-red-500/70 focus:ring-red-500/30' : 'border-white/15 focus:ring-white/20'}`} />
            <div className="mt-1.5 flex items-start justify-between gap-3">
              {titleError ? <p id="feedback-title-error" role="alert" className="text-xs text-red-400">{titleError}</p> : <span />}
              <span id="feedback-title-count" className="shrink-0 text-xs tabular-nums text-zinc-500">{title.length}/150</span>
            </div>
          </div>
          <label className="block text-sm font-medium">Description <span className="text-zinc-500">(optional)</span><textarea maxLength={1000} rows={4} value={description} onChange={(e) => setDescription(e.target.value.replace(/[^\S\n]{2,}/gu, ' ').replace(/^\s+/u, '').replace(/\n{3,}/g, '\n\n'))} onBlur={() => setDescription(cleanFeedbackText(description))} placeholder="What happened, or how could we improve?" className="mt-1.5 w-full resize-y rounded-lg border border-white/15 bg-zinc-950 p-3" /><span className="mt-1 block text-right text-xs text-zinc-500">{description.length}/1,000</span></label>
          <p className="text-xs text-zinc-500">Up to 5 submissions per account every 24 hours. Extra spaces are removed.</p>
          {message ? <p role="alert" className="text-sm text-red-400">{message}</p> : null}
          <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
            <button type="button" onClick={close} className="inline-flex h-10 min-w-20 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] px-4 text-sm font-semibold text-zinc-300 transition duration-150 hover:border-white/25 hover:bg-white/10 hover:text-white active:scale-95 active:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 motion-reduce:transform-none">Cancel</button>
            <button type="submit" disabled={busy} aria-busy={busy} className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white shadow-sm transition duration-150 hover:bg-red-500 hover:shadow-lg hover:shadow-red-600/15 active:scale-95 active:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-wait disabled:opacity-60 motion-reduce:transform-none">{busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}{busy ? 'Submitting…' : 'Submit feedback'}</button>
          </div>
        </form>}
      </div>
    </div>, document.body) : null}
  </>;
}
