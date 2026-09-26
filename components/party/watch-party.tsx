'use client';

import type { InboundMessage, Realtime } from 'ably';
import type { ChatClient, Message, PresenceMember, Room } from '@ably/chat';
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
import { Check, Copy, ListVideo, LogOut, Maximize, MessageCircle, Minimize, PanelRightClose, PanelRightOpen, Pause, Play, Radio, RefreshCw, Send, Users, Volume2 } from 'lucide-react';

import { PLAYER_PROGRESS_EVENT, type PlayerProgressDetail } from '@/lib/party/player-events';
import {
  decideGuestAction,
  DRIFT_TOLERANCE_S,
  expectedHostTime,
  nextPlayState,
  pickSuccessor,
} from '@/lib/party/sync-logic';
import {
  partyRoomName,
  partySyncChannel,
  type PartyPresenceData,
  type PartySyncState,
  type WatchParty,
} from '@/lib/party/types';

const PUBLISH_INTERVAL_MS = 5_000;
/** Embeds report 0:00 (or stale times) for a few seconds after loading before honouring `startAt`. */
const RESYNC_SETTLE_MS = 8_000;
const PAUSE_CONFIRM_MS = 1_500;
const CHAT_MIN_INTERVAL_MS = 1_000;
const HOST_STALE_MS = 30_000;
const HOST_GONE_GRACE_MS = 8_000;
const HEARTBEAT_MS = 30_000;

export interface FollowTarget {
  episode: string | null;
  /** Guests unload the embed while the host is paused, so everyone stops at the same frame. */
  paused: boolean;
  season: string | null;
  time: number;
}

export function formatClock(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = String(value % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

interface Viewer extends PartyPresenceData {
  clientId: string;
  joinedAt: number;
}

interface LiveConnection {
  chat: ChatClient;
  realtime: Realtime;
  room: Room;
}

interface ActivityItem {
  id: string;
  at: number;
  text: string;
}

interface PartyContextValue {
  activity: ActivityItem[];
  claimHost: () => Promise<void>;
  code: string | null;
  endParty: () => void;
  getSnapshot: () => PartySyncState;
  hostState: PartySyncState | null;
  hostPaused: boolean;
  hostStale: boolean;
  isHost: boolean;
  joinWithSound: () => void;
  joined: boolean;
  leaveParty: () => void;
  messages: Message[];
  needsSignIn: boolean;
  outOfSync: boolean;
  party: WatchParty | null;
  pushActivity: (text: string) => void;
  ready: boolean;
  refreshParty: () => void;
  resync: () => void;
  selfId: string | null;
  sendChat: (text: string) => Promise<void>;
  starting: boolean;
  startError: string | null;
  startParty: () => void;
  status: 'idle' | 'loading' | 'active' | 'ended' | 'error';
  viewers: Viewer[];
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
  entry: { backdropUrl?: string; id: string; posterUrl?: string; provider: string; title: string; type: string };
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
  const hostStateRef = useRef<PartySyncState | null>(null);
  const [hostSeenAt, setHostSeenAt] = useState(0);
  const [now, setNow] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [live, setLive] = useState<LiveConnection | null>(null);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const lastChatAtRef = useRef(0);
  const localTimeRef = useRef<{ at: number; duration: number | null; playing: boolean; seconds: number }>({ at: 0, duration: null, playing: false, seconds: 0 });
  const guestPausedRef = useRef(false);
  const settleUntilRef = useRef(0);
  const awaitingResyncRef = useRef<number | null>(null);
  const failedResyncsRef = useRef(0);
  const [outOfSync, setOutOfSync] = useState(false);
  const refreshPartyRef = useRef<() => void>(() => undefined);
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

  const presenceDataRef = useRef<PartyPresenceData>({ image: null, name: 'Viewer', role: 'guest' });
  useEffect(() => {
    presenceDataRef.current = {
      image: session?.user?.image ?? null,
      name: session?.user?.name ?? session?.user?.email ?? 'Viewer',
      role: 'guest',
    };
  }, [session?.user?.email, session?.user?.image, session?.user?.name]);

  // Ably is only downloaded and connected once someone is actually in a party.
  useEffect(() => {
    if (status !== 'active' || !userId || !code) return;
    let cancelled = false;
    let teardown: (() => void) | null = null;

    void (async () => {
      const [{ Realtime: RealtimeClient }, { ChatClient: ChatClientCtor, ChatMessageEventType }] = await Promise.all([
        import('ably'),
        import('@ably/chat'),
      ]);
      if (cancelled) return;
      const realtime = new RealtimeClient({ authUrl: '/api/party/token', closeOnUnload: true });
      const chat = new ChatClientCtor(realtime);
      const roomName = partyRoomName(code);
      try {
        const room = await chat.rooms.get(roomName);
        await room.attach();
        if (cancelled) throw new Error('cancelled');

        const refreshMembers = () => void room.presence.get().then((list) => {
          if (!cancelled) setMembers(list);
        }).catch(() => undefined);
        const presenceSub = room.presence.subscribe(refreshMembers);
        const messageSub = room.messages.subscribe((event) => {
          if (event.type !== ChatMessageEventType.Created) return;
          setMessages((current) => (current.some((item) => item.serial === event.message.serial)
            ? current
            : [...current, event.message].slice(-200)));
        });
        void messageSub.historyBeforeSubscribe({ limit: 50 }).then((page) => {
          if (cancelled) return;
          setMessages((current) => {
            const known = new Set(current.map((item) => item.serial));
            return [...page.items.filter((item) => !known.has(item.serial)).reverse(), ...current];
          });
        }).catch(() => undefined);
        await room.presence.enter(presenceDataRef.current);
        refreshMembers();
        setLive({ chat, realtime, room });

        teardown = () => {
          presenceSub.unsubscribe();
          messageSub.unsubscribe();
          void room.presence.leave().catch(() => undefined);
          void chat.rooms.release(roomName).catch(() => undefined);
          realtime.close();
        };
      } catch {
        void chat.rooms.release(roomName).catch(() => undefined);
        realtime.close();
      }
    })();

    return () => {
      cancelled = true;
      teardown?.();
      setLive(null);
      setMembers([]);
      setMessages([]);
    };
  }, [code, status, userId]);

  const viewers = useMemo<Viewer[]>(() => {
    const byClient = new Map<string, Viewer>();
    for (const member of members) {
      const data = (member.data ?? {}) as Partial<PartyPresenceData>;
      const joinedAt = member.updatedAt instanceof Date ? member.updatedAt.getTime() : Number.POSITIVE_INFINITY;
      const existing = byClient.get(member.clientId);
      byClient.set(member.clientId, {
        clientId: member.clientId,
        image: data.image ?? null,
        joinedAt: Math.min(existing?.joinedAt ?? Infinity, joinedAt),
        name: data.name ?? 'Viewer',
        role: member.clientId === party?.hostId ? 'host' : 'guest',
      });
    }
    return [...byClient.values()].sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : a.joinedAt - b.joinedAt));
  }, [members, party?.hostId]);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const { duration, seconds, status: playerStatus } = (event as CustomEvent<PlayerProgressDetail>).detail;
      const previous = localTimeRef.current;
      const playing = nextPlayState(previous, seconds, playerStatus);
      if (Date.now() < settleUntilRef.current) {
        localTimeRef.current = { ...previous, duration: duration ?? previous.duration, playing };
        return;
      }
      if (awaitingResyncRef.current !== null) {
        if (Math.abs(seconds - awaitingResyncRef.current) <= DRIFT_TOLERANCE_S * 2) failedResyncsRef.current = 0;
        awaitingResyncRef.current = null;
      }
      localTimeRef.current = { at: Date.now(), duration: duration ?? previous.duration, playing, seconds };
    };
    window.addEventListener(PLAYER_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(PLAYER_PROGRESS_EVENT, onProgress);
  }, []);

  const buildState = useCallback((): PartySyncState => {
    const local = localTimeRef.current;
    const elapsed = local.playing && local.at ? (Date.now() - local.at) / 1000 : 0;
    return {
      duration: local.duration,
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
    if (!live || !isHost || !code) return;
    const channel = live.realtime.channels.get(partySyncChannel(code));
    let last = buildState();
    let lastPublishedAt = 0;
    const publish = () => {
      last = buildState();
      lastPublishedAt = Date.now();
      void channel.publish('state', last).catch(() => undefined);
    };
    const onProgress = () => {
      const next = buildState();
      const predicted = last.time + (last.playing ? (Date.now() - last.sentAt) / 1000 : 0);
      const changed = next.playing !== last.playing || Math.abs(next.time - predicted) > 4;
      if (changed && Date.now() - lastPublishedAt > 800) publish();
    };
    publish();
    const timer = setInterval(publish, PUBLISH_INTERVAL_MS);
    window.addEventListener(PLAYER_PROGRESS_EVENT, onProgress);
    return () => {
      clearInterval(timer);
      window.removeEventListener(PLAYER_PROGRESS_EVENT, onProgress);
    };
  }, [buildState, live, code, isHost]);

  // Guests: follow the host.
  useEffect(() => {
    if (!live || isHost || !code || !party) return;
    const channel = live.realtime.channels.get(partySyncChannel(code), { params: { rewind: '1' } });
    const listener = (message: InboundMessage) => {
      if (message.name === 'host') {
        refreshPartyRef.current();
        return;
      }
      if (message.clientId !== party.hostId) return;
      if (message.name === 'end') {
        setStatus('ended');
        setPartyParam(null);
        return;
      }
      if (message.name === 'state') {
        hostStateRef.current = message.data as PartySyncState;
        setHostState(message.data as PartySyncState);
        setHostSeenAt(Date.now());
      }
    };
    void channel.subscribe(listener);
    return () => channel.unsubscribe(listener);
  }, [live, code, isHost, party]);

  useEffect(() => {
    if (!hostState || isHost || !code) return;
    if (hostState.mediaId !== entry.id) {
      const target = new URL(hostState.watchPath, window.location.origin);
      target.searchParams.set('party', code);
      router.replace(`${target.pathname}${target.search}`);
      return;
    }
    if (!joined) return;

    const follow = (paused: boolean, drift = false) => {
      const target = expectedHostTime(hostState, Date.now());
      lastResyncRef.current = Date.now();
      guestPausedRef.current = paused;
      settleUntilRef.current = paused ? 0 : Date.now() + RESYNC_SETTLE_MS;
      awaitingResyncRef.current = drift ? target : null;
      localTimeRef.current = { ...localTimeRef.current, at: 0 };
      onFollowRef.current({ episode: hostState.episode, paused, season: hostState.season, time: target });
    };
    const action = decideGuestAction({
      episode,
      failedResyncs: failedResyncsRef.current,
      guestPaused: guestPausedRef.current,
      host: hostState,
      lastResyncAt: lastResyncRef.current,
      local: localTimeRef.current,
      now: Date.now(),
      season,
      settleUntil: settleUntilRef.current,
    });

    if (action === 'pause') {
      // Ignore sub-second pauses (buffering, scrubbing) so guests don't unload and reload the embed.
      const timer = setTimeout(() => {
        const latest = hostStateRef.current;
        if (latest && !latest.playing) follow(true);
      }, PAUSE_CONFIRM_MS);
      return () => clearTimeout(timer);
    }
    if (action === 'resume') follow(false);
    if (action === 'episode') {
      follow(false);
      if (hostState.episode) {
        const id = setTimeout(() => pushActivity(
          `Host switched to ${hostState.season ? `S${hostState.season} · ` : ''}E${hostState.episode}`,
        ), 0);
        return () => clearTimeout(id);
      }
    }
    if (action === 'drift') {
      failedResyncsRef.current += 1;
      follow(false, true);
    }
    if (action === 'out-of-sync') {
      // Reloading at the host's time keeps failing (embed ignores startAt): stop looping and let the viewer decide.
      const id = setTimeout(() => setOutOfSync(true), 0);
      return () => clearTimeout(id);
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

  const refreshParty = useCallback(() => {
    if (!code) return;
    void fetch(`/api/party/${code}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { party?: WatchParty } | null) => {
        if (!json?.party) return;
        if (json.party.endedAt) {
          setStatus('ended');
          setPartyParam(null);
          return;
        }
        setParty((current) => {
          if (current && current.hostId !== json.party!.hostId) {
            setTimeout(() => pushActivity(`${json.party!.hostName} is now the host`), 0);
          }
          return json.party!;
        });
      })
      .catch(() => undefined);
  }, [code, pushActivity]);
  useEffect(() => {
    refreshPartyRef.current = refreshParty;
  }, [refreshParty]);

  const claimHost = useCallback(async () => {
    if (!code) return;
    const response = await fetch(`/api/party/${code}/claim`, { method: 'POST' }).catch(() => null);
    const json = await response?.json().catch(() => null) as { party?: WatchParty } | null;
    if (response?.ok && json?.party) {
      setParty(json.party);
      setJoined(true);
      if (guestPausedRef.current) {
        guestPausedRef.current = false;
        onFollowRef.current({
          episode: hostState?.episode ?? null,
          paused: false,
          season: hostState?.season ?? null,
          time: hostState?.time ?? 0,
        });
      }
      pushActivity('You are now the host');
      if (live) void live.realtime.channels.get(partySyncChannel(code)).publish('host', { hostId: json.party.hostId }).catch(() => undefined);
    } else if (json?.party) {
      setParty(json.party);
    }
  }, [live, code, hostState, pushActivity]);

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
          backdropUrl: entry.backdropUrl ?? null,
          duration: localTimeRef.current.duration,
          episode,
          experience: experienceId,
          mediaId: entry.id,
          mediaProvider: entry.provider,
          mediaType: entry.type,
          posterUrl: entry.posterUrl ?? null,
          season,
          time: buildState().time,
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
  }, [buildState, entry.backdropUrl, entry.id, entry.posterUrl, entry.provider, entry.title, entry.type, episode, experienceId, pushActivity, season, userId]);

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
    if (live) void live.realtime.channels.get(partySyncChannel(code)).publish('end', {}).catch(() => undefined);
    void fetch(`/api/party/${code}`, {
      body: JSON.stringify({ end: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    reset();
  }, [live, code, reset]);

  const resync = useCallback(() => {
    const state = hostStateRef.current;
    failedResyncsRef.current = 0;
    setOutOfSync(false);
    if (!state) return;
    const target = state.time + (state.playing ? (Date.now() - state.sentAt) / 1000 : 0);
    lastResyncRef.current = Date.now();
    settleUntilRef.current = Date.now() + RESYNC_SETTLE_MS;
    guestPausedRef.current = !state.playing;
    onFollowRef.current({ episode: state.episode, paused: !state.playing, season: state.season, time: target });
  }, []);

  const joinWithSound = useCallback(() => {
    setJoined(true);
    lastResyncRef.current = Date.now();
    if (hostState) {
      const expected = hostState.time + (hostState.playing ? (Date.now() - hostState.sentAt) / 1000 : 0);
      guestPausedRef.current = !hostState.playing;
      settleUntilRef.current = Date.now() + RESYNC_SETTLE_MS;
      onFollowRef.current({ episode: hostState.episode, paused: !hostState.playing, season: hostState.season, time: expected });
    }
  }, [hostState]);

  const selfId = userId;
  const presenceEntries = useMemo(() => viewers.map(({ clientId, joinedAt }) => ({ clientId, joinedAt })), [viewers]);
  const successor = pickSuccessor(presenceEntries, party?.hostId ?? null);

  // Host left: the longest-present viewer claims the role; everyone else re-reads the party shortly after.
  useEffect(() => {
    if (!live || isHost || !successor) return;
    const timer = setTimeout(() => {
      if (successor === selfId) void claimHost();
      else refreshParty();
    }, HOST_GONE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [claimHost, isHost, live, refreshParty, selfId, successor]);

  // Keeps the public "Live Watch Parties" row current.
  const viewerCount = viewers.length;
  useEffect(() => {
    if (!live || !isHost || !code) return;
    const beat = () => {
      const snapshot = buildState();
      void fetch(`/api/party/${code}`, {
        body: JSON.stringify({
          duration: snapshot.duration,
          episode: snapshot.episode,
          season: snapshot.season,
          time: snapshot.time,
          viewerCount: Math.max(1, viewerCount),
          watchPath: snapshot.watchPath,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      }).catch(() => undefined);
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [buildState, code, isHost, live, viewerCount]);

  const seenViewersRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!live) {
      seenViewersRef.current = null;
      return;
    }
    const current = new Set(viewers.map((viewer) => viewer.clientId));
    const previous = seenViewersRef.current;
    seenViewersRef.current = current;
    if (!previous) return;
    const arrived = viewers.filter((viewer) => !previous.has(viewer.clientId));
    const left = [...previous].filter((id) => !current.has(id)).length;
    const id = setTimeout(() => {
      arrived.forEach((viewer) => pushActivity(`${viewer.name} joined`));
      if (left) pushActivity(`${left} ${left === 1 ? 'viewer' : 'viewers'} left`);
    }, 0);
    return () => clearTimeout(id);
  }, [live, pushActivity, viewers]);

  const sendChat = useCallback(async (text: string) => {
    const clean = text.trim().slice(0, 500);
    if (!clean || !live) return;
    if (Date.now() - lastChatAtRef.current < CHAT_MIN_INTERVAL_MS) throw new Error('Slow down');
    lastChatAtRef.current = Date.now();
    await live.room.messages.send({
      metadata: { image: session?.user?.image ?? null, name: session?.user?.name ?? 'Viewer' },
      text: clean,
    });
  }, [live, session?.user?.image, session?.user?.name]);

  const value = useMemo<PartyContextValue>(() => ({
    activity,
    claimHost,
    code,
    endParty,
    getSnapshot: buildState,
    hostState: isHost ? null : hostState,
    hostPaused: Boolean(hostState && !hostState.playing),
    hostStale: !isHost && status === 'active' && (!hostSeenAt || now - hostSeenAt > HOST_STALE_MS),
    isHost,
    joinWithSound,
    joined: isHost || joined,
    leaveParty: reset,
    messages,
    needsSignIn,
    outOfSync: outOfSync && !isHost,
    party,
    pushActivity,
    ready: Boolean(live && party),
    refreshParty,
    resync,
    selfId,
    sendChat,
    starting,
    startError,
    startParty: () => void startParty(),
    status,
    viewers,
  }), [messages, selfId, sendChat, viewers, activity, buildState, claimHost, live, code, endParty, hostSeenAt, hostState, isHost, joinWithSound, joined, needsSignIn, now, outOfSync, party, pushActivity, refreshParty, reset, resync, startError, startParty, starting, status]);

  // Never wrap the player in anything that appears later: a changed tree would remount it and reload the embed.
  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
}

function useViewers() {
  return useParty().viewers;
}

function LiveBadge() {
  const viewers = useViewers();
  return (
    <span
      className="flex items-center overflow-hidden rounded-full border border-white/15 bg-black/55 text-[11px] font-bold text-white shadow-lg backdrop-blur-md"
      aria-label={`Live watch party, ${viewers.length} watching`}
    >
      <span className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 uppercase tracking-[0.14em]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        Live
      </span>
      <span className="flex items-center gap-1 px-2.5 py-1 tabular-nums">
        <Users className="h-3 w-3 text-zinc-300" />
        {viewers.length}
      </span>
    </span>
  );
}

function GuestFullscreenButton({ visible }: { visible: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSupported(Boolean(document.fullscreenEnabled)), 0);
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      clearTimeout(id);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  // Guests can't reach the embed's own fullscreen control, so fullscreen the player box it sits in.
  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const stage = buttonRef.current?.parentElement;
    void stage?.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }, []);

  if (!supported) return null;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      className={`absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] right-[calc(env(safe-area-inset-right)+0.75rem)] z-40 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-md transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
        visible || !fullscreen ? 'opacity-100' : 'opacity-0 hover:opacity-100 focus-visible:opacity-100'
      }`}
    >
      {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
    </button>
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

      {guestView && party.joined ? <GuestFullscreenButton visible={chromeVisible} /> : null}

      {guestView && party.joined && party.hostPaused && !party.hostStale ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/5">
            <Pause className="h-6 w-6 fill-current" />
          </span>
          <p className="text-lg font-bold">Paused by {party.party?.hostName ?? 'the host'}</p>
          {party.hostState ? (
            <p className="font-mono text-sm text-zinc-400">
              {formatClock(party.hostState.time)}
              {party.hostState.duration ? ` / ${formatClock(party.hostState.duration)}` : ''}
            </p>
          ) : null}
          <p className="text-xs text-zinc-500">Playback resumes for everyone when the host presses play.</p>
        </div>
      ) : null}

      {guestView && party.joined && party.outOfSync && !party.hostPaused ? (
        <div className="absolute inset-x-0 bottom-16 z-40 flex justify-center">
          <button
            type="button"
            onClick={party.resync}
            className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-red-500"
          >
            <RefreshCw className="h-4 w-4" />
            Out of sync — jump to host
          </button>
        </div>
      ) : null}

      {guestView && party.joined && party.hostStale ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center">
          <span className="rounded-full bg-black/75 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
            Waiting for the host…
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
  const [collapsed, setCollapsed] = useState(false);
  const [seenMessages, setSeenMessages] = useState(0);
  const messageCount = party.messages.length;
  const chatVisible = !collapsed && tab === 'chat';
  const unread = chatVisible ? 0 : Math.max(0, messageCount - seenMessages);

  useEffect(() => {
    if (!chatVisible) return;
    const id = setTimeout(() => setSeenMessages(messageCount), 0);
    return () => clearTimeout(id);
  }, [chatVisible, messageCount]);

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

  if (collapsed) {
    const railButton = 'relative flex h-10 w-10 items-center justify-center rounded-xl text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';
    return (
      <aside
        aria-label="Watch party (collapsed)"
        className="flex shrink-0 items-center gap-1.5 border-t border-white/10 bg-[#0b0b0b] px-2 py-1.5 landscape:h-full landscape:w-14 landscape:flex-col landscape:gap-2 landscape:border-l landscape:border-t-0 landscape:py-3"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show watch party panel"
          title="Show watch party panel"
          className={`${railButton} bg-white/10 text-white`}
        >
          <PanelRightOpen className="h-[18px] w-[18px]" />
        </button>

        <span className="hidden h-px w-6 bg-white/10 landscape:block" aria-hidden="true" />

        <div
          className="flex h-10 items-center gap-1.5 rounded-xl px-2 landscape:h-auto landscape:w-10 landscape:flex-col landscape:gap-1 landscape:px-0 landscape:py-2"
          title={`${viewers.length} watching`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
          </span>
          <span className="flex items-center gap-1 text-xs font-bold tabular-nums text-white landscape:flex-col landscape:gap-0.5">
            <Users className="h-3.5 w-3.5 text-zinc-400" />
            {viewers.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setTab('chat');
            setCollapsed(false);
          }}
          aria-label={unread ? `Open chat, ${unread} unread` : 'Open chat'}
          title="Chat"
          className={railButton}
        >
          <MessageCircle className="h-[18px] w-[18px]" />
          {unread ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white ring-2 ring-[#0b0b0b]">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>

        <ul className="ml-auto flex -space-x-2 landscape:ml-0 landscape:mt-auto landscape:flex-col landscape:items-center landscape:space-x-0 landscape:-space-y-2">
          {viewers.slice(0, 3).map((viewer) => (
            <li key={viewer.clientId} className={`relative h-7 w-7 overflow-hidden rounded-full bg-zinc-800 ring-2 ${viewer.role === 'host' ? 'ring-red-600' : 'ring-[#0b0b0b]'}`} title={viewer.name}>
              {viewer.image ? <Image src={viewer.image} alt="" fill sizes="28px" className="object-cover" /> : (
                <span className="flex h-full items-center justify-center text-[10px] font-bold">{viewer.name.slice(0, 1).toUpperCase()}</span>
              )}
            </li>
          ))}
          {viewers.length > 3 ? (
            <li className="relative flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300 ring-2 ring-[#0b0b0b]">
              +{viewers.length - 3}
            </li>
          ) : null}
        </ul>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Watch party"
      className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden border-white/10 bg-[#0b0b0b] p-2 landscape:h-full landscape:w-[22rem] landscape:flex-none landscape:border-l xl:landscape:w-96"
    >
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          <h2 className="whitespace-nowrap text-sm font-black">Watch Party</h2>
          <button
            type="button"
            onClick={() => void copyInvite()}
            title="Copy invite link"
            className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-zinc-300 transition hover:bg-white/20 hover:text-white"
          >
            {party.code}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Hide watch party panel"
            title="Hide panel"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="truncate">{party.isHost ? 'You are hosting' : `Hosted by ${party.party?.hostName ?? 'host'}`}</span>
          <span aria-hidden="true">·</span>
          <span className="flex shrink-0 items-center gap-1 tabular-nums"><Users className="h-3 w-3" />{viewers.length} watching</span>
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void copyInvite()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-bold text-black transition hover:bg-zinc-200"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Link copied' : 'Invite'}
          </button>
          <button
            type="button"
            onClick={party.isHost ? party.endParty : party.leaveParty}
            title={party.isHost ? 'End the party for everyone' : 'Leave the party'}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-xs font-bold text-white transition hover:bg-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            {party.isHost ? 'End party' : 'Leave'}
          </button>
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

      <PartyTimeline />

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
            {id === 'chat' && unread ? (
              <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>
            ) : null}
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

function PartyTimeline() {
  const party = useParty();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const state = party.isHost ? party.getSnapshot() : party.hostState;
  if (!state) return null;
  const time = state.time + (!party.isHost && state.playing && now ? Math.max(0, now - state.sentAt) / 1000 : 0);
  const duration = state.duration;
  const start = party.party?.startTime ?? 0;
  const percent = duration ? Math.min(100, (time / duration) * 100) : 0;
  const startPercent = duration ? Math.min(100, (start / duration) * 100) : 0;
  const episodeLabel = state.episode ? `${state.season ? `S${state.season} · ` : ''}E${state.episode}` : null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3" aria-label="Host timeline">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          {state.playing ? <Play className="h-3.5 w-3.5 shrink-0 fill-current text-red-500" /> : <Pause className="h-3.5 w-3.5 shrink-0 fill-current text-zinc-400" />}
          <span className="truncate">{party.isHost ? 'You are at' : 'Host is at'} {formatClock(time)}{episodeLabel ? ` · ${episodeLabel}` : ''}</span>
        </p>
        {duration ? <span className="shrink-0 font-mono text-[10px] text-zinc-500">{formatClock(duration)}</span> : null}
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-red-600 transition-[width] duration-1000 ease-linear" style={{ width: `${percent}%` }} />
        {duration && start > 0 ? (
          <span className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-white/70" style={{ left: `${startPercent}%` }} title={`Party started at ${formatClock(start)}`} />
        ) : null}
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-500">Party started at {formatClock(start)}</p>
    </section>
  );
}

function PartyChat() {
  const { messages, selfId, sendChat } = useParty();
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ behavior: 'smooth', top: listRef.current.scrollHeight });
  }, [messages.length]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setNotice(null);
    sendChat(text).catch((error: unknown) => {
      setDraft(text);
      setNotice(error instanceof Error && error.message === 'Slow down' ? 'You are sending messages too fast.' : 'Message not sent. Try again.');
    });
  }, [draft, sendChat]);

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
                <p className="text-[10px] font-semibold text-zinc-400">{mine ? 'You' : meta.name ?? 'Viewer'}</p>
                <p className={`mt-0.5 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-left text-sm ${mine ? 'rounded-tr-sm bg-red-600 text-white' : 'rounded-tl-sm bg-white/10 text-zinc-100'}`}>
                  {message.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {notice ? <p role="status" className="px-3 pb-1 text-[11px] text-amber-300">{notice}</p> : null}
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
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-white/30 focus:outline-none"
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
