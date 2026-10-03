'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Eye, ImagePlus, LoaderCircle, Megaphone, Plus, Save } from 'lucide-react';
import { announcementStatus, fromManilaInput, toManilaInput, validateAnnouncement, type PublicAnnouncement } from '@/lib/announcements/validation';
import { AnnouncementDialog } from './announcement-dialog';
import type { Announcement } from '@/lib/announcements/store';

type ListedPost = Omit<Announcement, 'bannerData'>;
const field = 'mt-1.5 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/10';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-wait disabled:opacity-50 motion-reduce:transform-none';
const date = (iso: string) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not set';

export function AnnouncementManager() {
  const [posts, setPosts] = useState<ListedPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(() => Date.now());
  const requestVersion = useRef(0);
  const [id, setId] = useState<string | undefined>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [bannerData, setBannerData] = useState<string | null | undefined>();
  const [existingBanner, setExistingBanner] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const imageVersion = useRef(0);
  const image = bannerData === undefined ? existingBanner : bannerData;
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch(`/api/admin/announcements?page=${page}`, { cache: 'no-store' });
      const result = await response.json();
      if (version !== requestVersion.current) return;
      setClock(Date.now());
      if (!response.ok) throw new Error(result.error ?? 'Could not load announcements.');
      setPosts(result.posts); setHasNext(result.hasNext); setListError('');
    } catch (error) { if (version === requestVersion.current) setListError(error instanceof Error ? error.message : 'Could not load announcements.'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [page]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const reset = () => { imageVersion.current++; setReadingImage(false); setId(undefined); setTitle(''); setDescription(''); setPublishAt(''); setExpiresAt(''); setBannerData(undefined); setExistingBanner(null); setError(''); if (fileInput.current) fileInput.current.value = ''; };
  const edit = (post: ListedPost) => {
    reset(); setNotice(''); setId(post.id); setTitle(post.title); setDescription(post.description); setPublishAt(toManilaInput(post.publishAt)); setExpiresAt(toManilaInput(post.expiresAt)); setExistingBanner(post.hasBanner ? `/api/announcements/${post.id}/banner?v=${encodeURIComponent(post.updatedAt)}` : null);
    editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const input = (state: 'draft' | 'published') => ({ title, description, state, publishAt: fromManilaInput(publishAt), expiresAt: fromManilaInput(expiresAt), ...(bannerData !== undefined ? { bannerData } : {}) });
  const save = async (state: 'draft' | 'published') => {
    if (busy || readingImage) return;
    setError(''); setNotice('');
    let values;
    try { values = validateAnnouncement(input(state)); } catch (error) { setError(error instanceof Error ? error.message : 'Check your announcement.'); return; }
    setBusy(true);
    try {
      const response = await fetch(id ? `/api/admin/announcements/${id}` : '/api/admin/announcements', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not save announcement.');
      reset(); setNotice(state === 'draft' ? 'Saved as draft. It is not visible to visitors.' : Date.parse(values.publishAt) > clock ? 'Announcement scheduled. It will appear at the selected publication time.' : 'Announcement published. It is now available to visitors.');
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save announcement.'); }
    finally { setBusy(false); }
  };
  const showPreview = () => {
    try {
      const values = validateAnnouncement(input('draft'));
      setPreview({ id: id ?? 'preview', title: values.title, description: values.description, publishAt: values.publishAt || new Date(clock).toISOString(), expiresAt: values.expiresAt, hasBanner: Boolean(image) }); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Add a title and content to preview.'); }
  };
  const closePreview = useCallback(() => setPreview(null), []);
  const editingPost = posts.find((post) => post.id === id);
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black tracking-tight">Announcements</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Share what’s new with visitors across PapiFlix, PapiAnime and PapiManga. Preview your post, then publish now or schedule it for later.</p></div><button type="button" disabled={busy} onClick={() => { reset(); setNotice(''); }} className={`${button} border border-white/15 bg-white/5 hover:bg-white/10`}><Plus className="h-4 w-4" />New announcement</button></header>
    {notice ? <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p> : null}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div ref={editor} className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3"><div className="rounded-lg bg-red-600/10 p-2 text-red-500"><Megaphone className="h-5 w-5" /></div><div><h2 className="font-bold">{id ? 'Edit announcement' : 'Create announcement'}</h2><p className="mt-0.5 text-xs text-zinc-500">{editingPost?.state === 'published' ? 'Saving a draft withdraws this post from visitors.' : 'Drafts are visible only to admins.'}</p></div></div>
        <form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save('published'); }}>
          <fieldset disabled={busy || readingImage} className="space-y-5 disabled:opacity-70">
            <div><label htmlFor="announcement-image" className="text-sm font-semibold text-zinc-200">Banner image <span className="font-normal text-zinc-500">(optional)</span></label><div className="mt-2 overflow-hidden rounded-xl border border-dashed border-white/20 bg-zinc-950">{image ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Announcement banner preview" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video flex-col items-center justify-center gap-2 text-zinc-500"><ImagePlus className="h-8 w-8" /><span className="text-xs">A cinematic banner sets the tone</span></div>}</div><input ref={fileInput} id="announcement-image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:font-semibold file:text-white hover:file:bg-white/15" onChange={(event) => {
              const file = event.target.files?.[0]; if (!file) return;
              if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP image under 2 MB.'); event.target.value = ''; return; }
              setError(''); setReadingImage(true); const version = ++imageVersion.current; const reader = new FileReader();
              reader.onload = () => { if (version === imageVersion.current) { setBannerData(String(reader.result)); setReadingImage(false); } };
              reader.onerror = () => { if (version === imageVersion.current) { setError('Could not read image.'); setReadingImage(false); } };
              reader.readAsDataURL(file);
            }} /><p className="mt-2 text-xs text-zinc-500">JPEG, PNG or WebP · up to 2 MB · 16:9 recommended. Images are resized for visitors.</p>{image ? <button type="button" onClick={() => { imageVersion.current++; setBannerData(null); if (fileInput.current) fileInput.current.value = ''; }} className="mt-2 text-xs font-semibold text-zinc-400 hover:text-white">Remove banner</button> : null}</div>
            <label className="block text-sm font-semibold text-zinc-200">Title <span className="text-red-400">*</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} aria-required="true" placeholder="Something worth sharing" className={field} /><span className="mt-1 block text-right text-xs font-normal tabular-nums text-zinc-500">{title.length}/150</span></label>
            <label className="block text-sm font-semibold text-zinc-200">Announcement content <span className="text-red-400">*</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} rows={6} aria-required="true" placeholder="Tell visitors what’s new, what’s changing, or what to expect." className={`${field} resize-y leading-6`} /><span className="mt-1 block text-right text-xs font-normal tabular-nums text-zinc-500">{description.length}/3,000</span></label>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><h3 className="flex items-center gap-2 text-sm font-bold"><CalendarClock className="h-4 w-4 text-zinc-400" />Publication window</h3><p className="mt-1 text-xs text-zinc-500">All times are Philippine Standard Time (UTC+8).</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="min-w-0 text-xs font-semibold text-zinc-300">Publish at<input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className={`${field} min-w-0`} /><span className="mt-1 block text-xs font-normal text-zinc-500">Leave blank to publish immediately.</span></label><label className="min-w-0 text-xs font-semibold text-zinc-300">Expires at <span className="text-red-400">*</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={`${field} min-w-0`} /><span className="mt-1 block text-xs font-normal text-zinc-500">Required to publish. Hidden automatically after this time.</span></label></div></div>
          </fieldset>
          {error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</p> : null}
          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4"><button type="button" disabled={busy || readingImage} onClick={showPreview} className={`${button} border border-white/15 text-zinc-300 hover:bg-white/10`}><Eye className="h-4 w-4" />Preview</button><button type="button" disabled={busy || readingImage} onClick={() => void save('draft')} className={`${button} border border-white/15 text-zinc-300 hover:bg-white/10`}><Save className="h-4 w-4" />{editingPost?.state === 'published' ? 'Withdraw to draft' : 'Save draft'}</button><button type="submit" disabled={busy || readingImage} className={`${button} bg-red-600 text-white hover:bg-red-500`}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}{busy ? 'Saving…' : publishAt && Date.parse(`${publishAt}:00+08:00`) > clock ? 'Schedule post' : editingPost?.state === 'published' ? 'Update post' : 'Publish now'}</button></div>
        </form>
      </div>
      <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Your announcements</h2><button type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading} className="text-xs font-semibold text-zinc-400 hover:text-white">{loading ? 'Loading…' : 'Refresh'}</button></div>{listError ? <p role="alert" className="text-sm text-red-400">{listError}</p> : null}{!loading && !posts.length ? <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">No announcements yet. Create a draft to get started.</div> : null}{posts.map((post) => {
        const status = announcementStatus(post, clock);
        return <article key={post.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold [overflow-wrap:anywhere]">{post.title}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${status === 'Live' ? 'bg-red-600/15 text-red-400' : status === 'Scheduled' ? 'bg-blue-500/15 text-blue-300' : 'bg-white/5 text-zinc-400'}`}>{status}</span></div><p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400 [overflow-wrap:anywhere]">{post.description}</p><dl className="mt-3 space-y-1 text-xs text-zinc-500"><div><dt className="inline">{post.state === 'draft' ? 'Planned publish: ' : 'Posted / scheduled: '}</dt><dd className="inline">{post.publishAt ? `${date(post.publishAt)} PHT` : 'On publish'}</dd></div><div><dt className="inline">Expires: </dt><dd className="inline">{date(post.expiresAt)}{post.expiresAt ? ' PHT' : ''}</dd></div></dl><button type="button" disabled={busy} onClick={() => edit(post)} className="mt-4 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 active:scale-95">Edit & preview</button></article>;
      })}<nav aria-label="Announcement pages" className="flex items-center justify-between text-sm"><button type="button" disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="text-zinc-400 hover:text-white disabled:opacity-30">Previous</button><span className="text-xs text-zinc-500">Page {page}</span><button type="button" disabled={!hasNext || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="text-zinc-400 hover:text-white disabled:opacity-30">Next</button></nav></section>
    </div>
    {preview ? <AnnouncementDialog post={preview} bannerSrc={image} onClose={closePreview} preview /> : null}
  </div>;
}
