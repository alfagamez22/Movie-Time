import Link from 'next/link';
import { adminList, type Feedback, type RegisteredUser } from '@/lib/feedback/admin';
import { getAdminSession } from '@/lib/auth/require-admin';
import { notFound } from 'next/navigation';

export async function Directory({ kind, params }: { kind: 'users' | 'feedback'; params: { page?: string; search?: string } }) {
  if (!(await getAdminSession())) notFound();
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? '1', 10) || 1));
  const search = (params.search ?? '').slice(0, 150);
  const { total, rows } = await adminList(kind, page, search);
  const href = (target: number) => `/dashboard/${kind}?${new URLSearchParams({ page: String(target), search })}`;
  return <div className="mx-auto max-w-6xl space-y-6">
    <header><h1 className="text-3xl font-black">{kind === 'users' ? 'Users' : 'Feedback'}</h1><p className="mt-2 text-sm text-zinc-400">{total} {kind === 'users' ? 'registered accounts. View names, email addresses and profile pictures.' : 'submissions. Ideas and issues shared by registered users.'}</p></header>
    <form className="flex gap-2"><label className="sr-only" htmlFor="directory-search">Search {kind}</label><input id="directory-search" name="search" defaultValue={search} maxLength={150} placeholder={kind === 'users' ? 'Search name or email' : 'Search title or category'} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-zinc-900 p-3" /><button className="rounded-lg bg-white px-4 font-semibold text-black">Search</button></form>
    {!rows.length ? <p className="rounded-xl border border-white/10 p-8 text-zinc-400">{search ? 'No matches found.' : 'Nothing here yet.'}</p> : <div className="space-y-3">{rows.map((row) => {
      const feedback = kind === 'feedback' ? row as Feedback : null;
      const user = feedback ? feedback.user : row as RegisteredUser;
      return <article key={row.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">{user?.image ?
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800">{user?.name?.[0]?.toUpperCase() ?? '?'}</div>}
          <div className="min-w-0"><p className="break-words font-semibold">{user?.name ?? 'Unknown user'}</p><p className="break-all text-sm text-zinc-400">{user?.email ?? (feedback ? 'Account no longer available' : 'No email')}</p></div>
        </div>
        {feedback ? <div className="mt-4 min-w-0"><div className="flex flex-wrap gap-3 text-xs text-zinc-500"><span className="rounded bg-white/10 px-2 py-1 text-zinc-300">{feedback.category}</span><time dateTime={feedback.createdAt}>{new Date(feedback.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })} PHT</time></div><h2 className="mt-3 break-words text-lg font-bold [overflow-wrap:anywhere]">{feedback.title}</h2>{feedback.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400 [overflow-wrap:anywhere]">{feedback.description}</p> : <p className="mt-2 text-xs text-zinc-500">No description provided.</p>}</div> : null}
      </article>;
    })}</div>}
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm">{page > 1 ? <Link href={href(page - 1)} className="rounded-lg border border-white/15 px-4 py-2">Previous</Link> : <span />}<span className="text-zinc-400">Page {page} of {Math.max(1, Math.ceil(total / 50))}</span>{page * 50 < total ? <Link href={href(page + 1)} className="rounded-lg border border-white/15 px-4 py-2">Next</Link> : <span />}</nav>
  </div>;
}
