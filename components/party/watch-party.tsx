'use client';

import * as Ably from 'ably';
import { ChatClient, ChatMessageEventType, type Message } from '@ably/chat';
import { ChatClientProvider, ChatRoomProvider, useMessages, usePresence, usePresenceListener } from '@ably/chat/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Check, Copy, ListVideo, LogOut, MessageCircle, Radio, Send, Users, Volume2 } from 'lucide-react';

import { PLAYER_PROGRESS_EVENT, type PlayerProgressDetail } from '@/lib/party/player-events';
import {
  partyRoomName,
  partySyncChannel,
  type PartyPresenceData,
  type PartySyncState,
  type WatchParty,
} from '@/lib/party/types';

const PUBLISH_INTERVAL_MS = 5_000;
const DRIFT_TOLERANCE_S = 20;
const RESYNC_COOLDOWN_MS = 20_000;
const HOST_STALE_MS = 30_000;

export interface FollowTarget {
  episode: string | null;
  season: string | null;
  time: number;
}

interface ActivityItem {
  id: string;
  at: number;
  text: string;
}

interface PartyContextValue {
  activity: ActivityItem[];
  code: string | null;
  endParty: () => void;
  hostPaused: boolean;
  hostStale: boolean;
  isHost: boolean;
  joinWithSound: () => void;
  joined: boolean;
  leaveParty: () => void;
  needsSignIn: boolean;
  party: WatchParty | null;
  pushActivity: (text: string) => void;
  ready: boolean;
  starting: boolean;
  startError: string | null;
  startParty: () => void;
  status: 'idle' | 'loading' | 'active' | 'ended' | 'error';
}

const PartyContext = createContext<PartyContextValue | null>(null);

function useParty() {
  const context = useContext(PartyContext);
  if (!context) throw new Error('Watch party components must be inside WatchPartyRoot');
  return context;
}

function readPartyParam() {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('party')?.toUpperCase() ?? null;
  return code && /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

function setPartyParam(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('party', code);
  else url.searchParams.delete('party');
  url.searchParams.delete('progress');
  window.history.replaceState(window.history.state, '', url);
}

function currentWatchPath() {
  const url = new URL(window.location.href);
  url.searchParams.delete('party');
  url.searchParams.delete('progress');
  return `${url.pathname}${url.search}`;
}

interface WatchPartyRootProps {
  children: ReactNode;
  entry: { id: string; provider: string; title: string; type: string };
  episode: string | null;
  experienceId: 'papiflix' | 'papianime';
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onFollow: (target: FollowTarget) => void;
  season: string | null;
}

export function WatchPartyRoot({ children, entry, episode, experienceId, iframeRef, onFollow, season }: WatchPartyRootProps) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ?? null;
  const [code, setCode] = useState<string | null>(null);
  const [party, setParty] = useState<WatchParty | null>(null);
  const [status, setStatus] = useState<PartyContextValue['status']>('idle');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [hostState, setHostState] = useState<PartySyncState | null>(null);
  const [hostSeenAt, setHostSeenAt] = useState(0);
  const [now, setNow] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [clients, setClients] = useState<{ chat: ChatClient; realtime: Ably.Realtime } | null>(null);
  const localTimeRef = useRef({ at: 0, playing: false, seconds: 0 });
  const lastResyncRef = useRef(0);
  const onFollowRef = useRef(onFollow);
  const isHost = Boolean(party && userId && party.hostId === userId);

  useEffect(() => {
    onFollowRef.current = onFollow;
  }, [onFollow]);

  const pushActivity = useCallback((text: string) => {
    setActivity((items) => [...items.slice(-99), { at: Date.now(), id: `${Date.now()}-${Math.random()}`, text }]);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setCode(readPartyParam()), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const id = setTimeout(() => setStatus('loading'), 0);
    fetch(`/api/party/${code}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('not found'))))
      .then(({ party: loaded }: { party: WatchParty }) => {
        if (cancelled) return;
        if (loaded.endedAt) {
          setStatus('ended');
          setPartyParam(null);
          return;
        }
        setParty(loaded);
        setStatus('active');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [code]);

  const needsSignIn = status === 'active' && sessionStatus === 'unauthenticated';

  useEffect(() => {
    if (status !== 'active' || !userId) return;
    const realtime = new Ably.Realtime({ authUrl: '/api/party/token', closeOnUnload: true });
    const chat = new ChatClient(realtime);
    const id = setTimeout(() => setClients({ chat, realtime }), 0);
    return () => {
      clearTimeout(id);
      setClients(null);
      realtime.close();
    };
  }, [status, userId]);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const { seconds, status: playerStatus } = (event as CustomEvent<PlayerProgressDetail>).detail;
      const previous = localTimeRef.current;
      const advancing = seconds > previous.seconds && seconds - previous.seconds < 30;
      const playing = playerStatus
        ? !['paused', 'pause', 'ended', 'completed'].includes(playerStatus)
        : advancing;
      localTimeRef.current = { at: Date.now(), playing, seconds };
    };
    window.addEventListener(PLAYER_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(PLAYER_PROGRESS_EVENT, onProgress);
  }, []);

  const buildState = useCallback((): PartySyncState => {
    const local = localTimeRef.current;
    const elapsed = local.playing && local.at ? (Date.now() - local.at) / 1000 : 0;
    return {
      episode,
      mediaId: entry.id,
      playing: local.playing,
      season,
      sentAt: Date.now(),
      time: Math.max(0, local.seconds + elapsed),
      watchPath: currentWatchPath(),
    };
  }, [entry.id, episode, season]);

  // Host: publish playback state periodically and whenever the episode changes.
  useEffect(() => {
    if (!clients || !isHost || !code) return;
    const channel = clients.realtime.channels.get(partySyncChannel(code));
    const publish = () => void channel.publish('state', buildState()).catch(() => undefined);
    publish();
    const timer = setInterval(publish, PUBLISH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [buildState, clients, code, isHost]);

  // Guests: follow the host.
  useEffect(() => {
    if (!clients || isHost || !code || !party) return;
    const channel = clients.realtime.channels.get(partySyncChannel(code), { params: { rewind: '1' } });
    const listener = (message: Ably.InboundMessage) => {
      if (message.clientId !== party.hostId) return;
      if (message.name === 'end') {
        setStatus('ended');
        setPartyParam(null);
        return;
      }
      if (message.name === 'state') {
        setHostState(message.data as PartySyncState);
        setHostSeenAt(Date.now());
      }
    };
    void channel.subscribe(listener);
    return () => channel.unsubscribe(listener);
  }, [clients, code, isHost, party]);

  useEffect(() => {
    if (!hostState || isHost || !code) return;
    if (hostState.mediaId !== entry.id) {
      const target = new URL(hostState.watchPath, window.location.origin);
      target.searchParams.set('party', code);
      router.replace(`${target.pathname}${target.search}`);
      return;
    }
    if (!joined) return;

    const expected = hostState.time + (hostState.playing ? (Date.now() - hostState.sentAt) / 1000 : 0);
    const episodeChanged = (hostState.season ?? null) !== season || (hostState.episode ?? null) !== episode;
    const local = localTimeRef.current;
    const localNow = local.seconds + (local.playing && local.at ? (Date.now() - local.at) / 1000 : 0);
    const drifted = local.at > 0 && Math.abs(localNow - expected) > DRIFT_TOLERANCE_S;
    const coolingDown = Date.now() - lastResyncRef.current < RESYNC_COOLDOWN_MS;

    if (episodeChanged || (drifted && !coolingDown)) {
      lastResyncRef.current = Date.now();
      onFollowRef.current({ episode: hostState.episode, season: hostState.season, time: expected });
      if (episodeChanged && hostState.episode) {
        const id = setTimeout(() => pushActivity(
          `Host switched to ${hostState.season ? `S${hostState.season} · ` : ''}E${hostState.episode}`,
        ), 0);
        return () => clearTimeout(id);
      }
    }
  }, [code, entry.id, episode, hostState, isHost, joined, pushActivity, router, season]);

  useEffect(() => {
    if (status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [status]);

  // Guests must not reach the embed's controls, including via keyboard focus.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const guestLocked = status === 'active' && !isHost && Boolean(party);
    if (guestLocked) iframe.setAttribute('tabindex', '-1');
    else iframe.removeAttribute('tabindex');
  });

  const startParty = useCallback(async () => {
    if (!userId) {
      void signIn('google', { callbackUrl: window.location.href });
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const response = await fetch('/api/party', {
        body: JSON.stringify({
          experience: experienceId,
          mediaId: entry.id,
          mediaProvider: entry.provider,
          mediaType: entry.type,
          title: entry.title,
          watchPath: currentWatchPath(),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const json = await response.json() as { error?: string; party?: WatchParty };
      if (!response.ok || !json.party) throw new Error(json.error ?? 'Could not start the party.');
      setPartyParam(json.party.code);
      setParty(json.party);
      setCode(json.party.code);
      setStatus('active');
      pushActivity('You started the watch party');
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not start the party.');
    } finally {
      setStarting(false);
    }
  }, [entry.id, entry.provider, entry.title, entry.type, experienceId, pushActivity, userId]);

  const reset = useCallback(() => {
    setPartyParam(null);
    setCode(null);
    setParty(null);
    setHostState(null);
    setJoined(false);
    setActivity([]);
    setStatus('idle');
  }, []);

  const endParty = useCallback(() => {
    if (!code) return;
    if (clients) void clients.realtime.channels.get(partySyncChannel(code)).publish('end', {}).catch(() => undefined);
    void fetch(`/api/party/${code}`, {
      body: JSON.stringify({ end: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    reset();
  }, [clients, code, reset]);

  const joinWithSound = useCallback(() => {
    setJoined(true);
    lastResyncRef.current = Date.now();
    if (hostState) {
      const expected = hostState.time + (hostState.playing ? (Date.now() - hostState.sentAt) / 1000 : 0);
      onFollowRef.current({ episode: hostState.episode, season: hostState.season, time: expected });
    }
  }, [hostState]);

  const value = useMemo<PartyContextValue>(() => ({
    activity,
    code,
    endParty,
    hostPaused: Boolean(hostState && !hostState.playing),
    hostStale: !isHost && status === 'active' && (!hostSeenAt || now - hostSeenAt > HOST_STALE_MS),
    isHost,
    joinWithSound,
    joined: isHost || joined,
    leaveParty: reset,
    needsSignIn,
    party,
    pushActivity,
    ready: Boolean(clients && party),
    starting,
    startError,
    startParty: () => void startParty(),
    status,
  }), [activity, clients, code, endParty, hostSeenAt, hostState, isHost, joinWithSound, joined, needsSignIn, now, party, pushActivity, reset, startError, startParty, starting, status]);

  const content = <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
  if (!clients || !code || !party) return content;

  return (
    <ChatClientProvider client={clients.chat}>
      <ChatRoomProvider name={partyRoomName(code)}>
        <PresenceEnter
          data={{
            image: session?.user?.image ?? null,
            name: session?.user?.name ?? session?.user?.email ?? 'Viewer',
            role: isHost ? 'host' : 'guest',
          }}
        />
        <PartyContext.Provider value={value}>{children}</PartyContext.Provider>
      </ChatRoomProvider>
    </ChatClientProvider>
  );
}

function PresenceEnter({ data }: { data: PartyPresenceData }) {
  usePresence({ initialData: data });
  return null;
}

function useViewers() {
  const { presenceData } = usePresenceListener();
  return useMemo(() => {
    const byClient = new Map<string, PartyPresenceData & { clientId: string }>();
    for (const member of presenceData) {
      const data = (member.data ?? {}) as Partial<PartyPresenceData>;
      byClient.set(member.clientId, {
        clientId: member.clientId,
        image: data.image ?? null,
        name: data.name ?? 'Viewer',
        role: data.role === 'host' ? 'host' : 'guest',
      });
    }
    return [...byClient.values()].sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : a.name.localeCompare(b.name)));
  }, [presenceData]);
}

function LiveBadge() {
  const viewers = useViewers();
  return (
    <span className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(220,38,38,0.55)]">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      Live
      <span className="tabular-nums">{viewers.length}</span>
    </span>
  );
}

/** Rendered inside the player box, above the iframe. */
export function WatchPartyPlayerLayer({ chromeVisible }: { chromeVisible: boolean }) {
  const party = useParty();
  const guestView = party.status === 'active' && party.party && !party.isHost;

  return (
    <>
      <div className="absolute right-[calc(env(safe-area-inset-right)+0.75rem)] top-[calc(env(safe-area-inset-top)+4.25rem)] z-40">
        {party.ready ? (
          <LiveBadge />
        ) : party.status === 'idle' || party.status === 'ended' || party.status === 'error' ? (
          <button
            type="button"
            onClick={party.startParty}
            disabled={party.starting}
            title={party.startError ?? 'Watch together with friends'}
            className={`flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-60 ${
              chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <Users className="h-4 w-4" />
            {party.starting ? 'Starting…' : 'Watch party'}
          </button>
        ) : null}
      </div>

      {guestView && party.joined ? (
        <div
          aria-hidden="true"
          data-testid="party-guest-barrier"
          className="absolute inset-0 z-30"
          onContextMenu={(event) => event.preventDefault()}
        />
      ) : null}

      {guestView && party.joined && (party.hostStale || party.hostPaused) ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center">
          <span className="rounded-full bg-black/75 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
            {party.hostStale ? 'Waiting for the host…' : 'The host paused'}
          </span>
        </div>
      ) : null}

      {(guestView && !party.joined) || party.needsSignIn ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-zinc-900/95 p-6 text-center shadow-2xl">
            <Radio className="mx-auto h-8 w-8 text-red-500" />
            <h2 className="mt-3 text-xl font-black">Join the watch party</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {party.party?.hostName ?? 'The host'} is watching {party.party?.title ?? 'this title'}. Playback follows the host.
            </p>
            {party.needsSignIn ? (
              <button
                type="button"
                onClick={() => void signIn('google', { callbackUrl: window.location.href })}
                className="mt-5 w-full rounded-lg bg-white py-2.5 text-sm font-bold text-black hover:bg-zinc-200"
              >
                Sign in with Google to join
              </button>
            ) : (
              <button
                type="button"
                autoFocus
                onClick={party.joinWithSound}
                disabled={!party.ready}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-60"
              >
                <Volume2 className="h-4 w-4" />
                {party.ready ? 'Join with sound' : 'Connecting…'}
              </button>
            )}
            <button type="button" onClick={party.leaveParty} className="mt-3 text-xs text-zinc-500 hover:text-zinc-300">
              Watch on my own instead
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

type PanelTab = 'episodes' | 'chat' | 'activity';

/** Replaces the regular sidebar while a party is active; renders `fallback` otherwise. */
export function WatchPartySidebar({ episodes, fallback }: { episodes: ReactNode | null; fallback: ReactNode }) {
  const party = useParty();
  if (!party.ready) return <>{fallback}</>;
  return <PartyPanel episodes={episodes} />;
}

function PartyPanel({ episodes }: { episodes: ReactNode | null }) {
  const party = useParty();
  const viewers = useViewers();
  const [tab, setTab] = useState<PanelTab>('chat');
  const [copied, setCopied] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);
  const { pushActivity } = party;

  useEffect(() => {
    const current = new Set(viewers.map((viewer) => viewer.clientId));
    const previous = seenRef.current;
    seenRef.current = current;
    if (!previous) return;
    const joined = viewers.filter((viewer) => !previous.has(viewer.clientId));
    const left = [...previous].filter((id) => !current.has(id));
    const id = setTimeout(() => {
      joined.forEach((viewer) => pushActivity(`${viewer.name} joined`));
      if (left.length) pushActivity(`${left.length} ${left.length === 1 ? 'viewer' : 'viewers'} left`);
    }, 0);
    return () => clearTimeout(id);
  }, [pushActivity, viewers]);

  const copyInvite = useCallback(async () => {
    const url = new URL(party.party?.watchPath ?? window.location.pathname, window.location.origin);
    url.searchParams.set('party', party.code ?? '');
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link', url.toString());
    }
  }, [party.code, party.party?.watchPath]);

  const tabs: Array<{ icon: typeof ListVideo; id: PanelTab; label: string }> = [
    ...(episodes ? [{ icon: ListVideo, id: 'episodes' as const, label: 'Episodes' }] : []),
    { icon: MessageCircle, id: 'chat', label: 'Chat' },
    { icon: Radio, id: 'activity', label: 'Activity' },
  ];

  return (
    <aside
      aria-label="Watch party"
      className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden border-white/10 bg-[#0b0b0b] p-2 landscape:h-full landscape:w-[22rem] landscape:flex-none landscape:border-l xl:landscape:w-96"
    >
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-black">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              Watch Party
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-zinc-300">{party.code}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {party.isHost ? 'You are hosting' : `Hosted by ${party.party?.hostName ?? 'host'}`} · {viewers.length} watching
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-black hover:bg-zinc-200"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Invite'}
            </button>
            <button
              type="button"
              onClick={party.isHost ? party.endParty : party.leaveParty}
              title={party.isHost ? 'End the party for everyone' : 'Leave the party'}
              className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-600"
            >
              <LogOut className="h-3.5 w-3.5" />
              {party.isHost ? 'End' : 'Leave'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Viewers</p>
        <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {viewers.map((viewer) => (
            <li key={viewer.clientId} className="flex w-14 shrink-0 flex-col items-center text-center" title={viewer.name}>
              <span className={`relative h-10 w-10 overflow-hidden rounded-full bg-zinc-800 ring-2 ${viewer.role === 'host' ? 'ring-red-600' : 'ring-white/15'}`}>
                {viewer.image ? <Image src={viewer.image} alt="" fill sizes="40px" className="object-cover" /> : (
                  <span className="flex h-full items-center justify-center text-sm font-bold">{viewer.name.slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <span className="mt-1 w-full truncate text-[10px] text-zinc-400">{viewer.role === 'host' ? 'Host' : viewer.name.split(' ')[0]}</span>
            </li>
          ))}
        </ul>
      </section>

      <div role="tablist" className="grid gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${tab === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
        {tab === 'episodes' && episodes ? (
          <div className="relative flex min-h-0 flex-1 flex-col">
            {!party.isHost ? (
              <p className="border-b border-white/10 px-3 py-2 text-xs text-zinc-400">The host picks the episode. You&apos;ll follow along automatically.</p>
            ) : null}
            <div className={`party-episodes flex min-h-0 flex-1 flex-col overflow-hidden ${party.isHost ? '' : 'pointer-events-none opacity-60'}`}>{episodes}</div>
          </div>
        ) : null}
        <div className={tab === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <PartyChat />
        </div>
        {tab === 'activity' ? <ActivityFeed /> : null}
      </section>
    </aside>
  );
}

function PartyChat() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const { historyBeforeSubscribe, sendMessage } = useMessages({
    listener: (event) => {
      if (event.type !== ChatMessageEventType.Created) return;
      setMessages((current) => (current.some((item) => item.serial === event.message.serial) ? current : [...current, event.message].slice(-200)));
    },
  });

  useEffect(() => {
    if (!historyBeforeSubscribe) return;
    let cancelled = false;
    void historyBeforeSubscribe({ limit: 50 })
      .then((page) => {
        if (cancelled) return;
        setMessages((current) => {
          const known = new Set(current.map((item) => item.serial));
          return [...page.items.filter((item) => !known.has(item.serial)).reverse(), ...current];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [historyBeforeSubscribe]);

  useEffect(() => {
    listRef.current?.scrollTo({ behavior: 'smooth', top: listRef.current.scrollHeight });
  }, [messages.length]);

  const send = useCallback(() => {
    const text = draft.trim().slice(0, 500);
    if (!text) return;
    setDraft('');
    void sendMessage({
      metadata: { image: session?.user?.image ?? null, name: session?.user?.name ?? 'Viewer' },
      text,
    }).catch(() => setDraft(text));
  }, [draft, sendMessage, session?.user?.image, session?.user?.name]);

  const selfId = session?.user?.id;

  return (
    <>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {messages.length === 0 ? <p className="py-8 text-center text-xs text-zinc-500">Say hi to the party 👋</p> : null}
        {messages.map((message) => {
          const meta = (message.metadata ?? {}) as { image?: string | null; name?: string };
          const mine = message.clientId === selfId;
          return (
            <div key={message.serial} className={`flex gap-2 ${mine ? 'flex-row-reverse text-right' : ''}`}>
              <span className="relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                {meta.image ? <Image src={meta.image} alt="" fill sizes="28px" className="object-cover" /> : null}
              </span>
              <div className="min-w-0 max-w-[80%]">
                <p className="text-[10px] font-semibold text-zinc-500">{mine ? 'You' : meta.name ?? 'Viewer'}</p>
                <p className={`mt-0.5 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-left text-sm ${mine ? 'rounded-tr-sm bg-red-600 text-white' : 'rounded-tl-sm bg-white/10 text-zinc-100'}`}>
                  {message.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="flex gap-2 border-t border-white/10 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder="Message the party…"
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
        />
        <button type="submit" aria-label="Send message" disabled={!draft.trim()} className="rounded-lg bg-white px-3 text-black disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </>
  );
}

function ActivityFeed() {
  const { activity } = useParty();
  return (
    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
      {activity.length === 0 ? <li className="py-8 text-center text-xs text-zinc-500">Joins, leaves and episode changes show up here.</li> : null}
      {[...activity].reverse().map((item) => (
        <li key={item.id} className="flex items-baseline justify-between gap-3">
          <span className="text-zinc-200">{item.text}</span>
          <time className="shrink-0 text-[10px] text-zinc-500">{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </li>
      ))}
    </ul>
  );
}
