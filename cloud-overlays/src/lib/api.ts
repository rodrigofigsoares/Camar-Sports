import { uppercaseTeams } from "../../../shared/lib/team-text";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyCommand, finishExpiredMatch, pause, type Command } from "../../../shared/domain/scoring";
import type { Match, Tournament, User } from "../../../shared/domain/model";
import { liveResource, nextClockEnd, subscribeLive } from './live';
import { MatchCommands } from '../../../shared/lib/match-commands';
const emptyMatches: Match[] = [];
const snapshots = new Map<string, {etag: string; data: unknown}>();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  value?: unknown,
): Promise<T> {
  const cached=method==='GET'?snapshots.get(path):undefined;
  if (method!=='GET') snapshots.clear();
  const res = await fetch("/api/" + path, {
    method,
    headers: {
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cached ? {'If-None-Match':cached.etag}:{}),
    },
    body: value === undefined ? undefined : JSON.stringify(uppercaseTeams(value)),
  });
  if(res.status===304 && cached) return cached.data as T;
  const data = uppercaseTeams(await res.json()) as T & { error?: string };
  if (!res.ok)
    throw new ApiError(data.error ?? "Não foi possível salvar.", res.status);
  const etag=res.headers.get('ETag');
  if(method==='GET' && etag) {
    if(snapshots.size>=200) snapshots.clear();
    snapshots.set(path,{etag,data});
  }
  return data;
}
export function useResource<T>(path: string, suspended?: {current: boolean}, snapshotOnly = false) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(true);
  const generation = useRef(0);
  const replaceData = useCallback((value: T) => {
    // A read started before this mutation must not restore its old snapshot.
    generation.current++;
    setData(value);
  }, []);
  const refresh = useCallback(async () => {
    if (suspended?.current) return;
    const gen = ++generation.current;
    try {
      const value = await api<T>(path);
      if (gen === generation.current && !suspended?.current) {
        setData(value);
        setError("");
        setConnected(true);
      }
    } catch (e) {
      if (gen === generation.current && !suspended?.current) {
        setError((e as Error).message);
        setConnected(false);
      }
    }
  }, [path, suspended]);
  useEffect(() => {
    setData(null);
    const overlay = location.hash.startsWith("#/overlay/");
    let stopped=false, running=false, pending=false;
    const reload=async () => {
      if(stopped || (!overlay && document.visibilityState!=='visible')) return;
      if(running) {pending=true;return;}
      running=true;
      do {pending=false;await refresh();} while(pending && !stopped);
      running=false;
    };
    void reload();
    if (snapshotOnly) return () => { stopped=true; generation.current++; };
    const resource=liveResource(path);
    const live=resource?subscribeLive(resource,()=>void reload()):undefined;
    let lastCheck=Date.now();
    const timer = setInterval(() => {
      const interval=live?(live.isOpen()?60000:5000):30000;
      if(Date.now()-lastCheck>=interval) {lastCheck=Date.now();void reload();}
    }, 5000);
    const resumed=()=>void reload();
    window.addEventListener('online',resumed);
    document.addEventListener('visibilitychange',resumed);
    return () => {
      stopped=true;
      generation.current++;
      live?.close();
      clearInterval(timer);
      window.removeEventListener('online',resumed);
      document.removeEventListener('visibilitychange',resumed);
    };
  }, [refresh, path, snapshotOnly]);
  useEffect(()=>{
    if (snapshotOnly) return;
    const deadline=nextClockEnd(data,serverNow());
    if(deadline===null) return;
    const timer=setTimeout(()=>void refresh(),Math.min(2147483647,Math.max(0,deadline-serverNow())+150));
    return ()=>clearTimeout(timer);
  },[data,refresh,snapshotOnly]);
  return { data, setData: replaceData, error, connected, refresh };
}
export function useMatch(matchId: string, sandbox = false) {
  const suspended=useRef(false);
  const resource = useResource<Match>("matches/" + matchId,suspended,sandbox),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const current=useRef(resource.data);
  current.current=resource.data;
  const history=useRef<Match[]>([]);
  const commands=useRef<MatchCommands|null>(null);
  useEffect(()=>{
    history.current=[];
    if (sandbox) return;
    const queue=new MatchCommands({
    current:()=>current.current,
    send:(revision,command,undo)=>api<Match>(`matches/${matchId}${undo?'/undo':''}`,'POST',{revision,command}),
    recover:()=>api<Match>('matches/'+matchId),
    render:match=>{current.current=match;resource.setData(match);},
    pending:value=>{suspended.current=value;setBusy(value);},
    notice:setNotice,
    now:serverNow,
    });
    commands.current=queue;
    setBusy(false);
    return ()=>{queue.dispose();commands.current=null;suspended.current=false;};
  },[matchId,sandbox,resource.setData]);
  const wasBusy=useRef(false);
  useEffect(()=>{
    if(wasBusy.current && !busy) void resource.refresh();
    wasBusy.current=busy;
  },[busy,resource.refresh]);
  useEffect(() => {
    if (!sandbox) return;
    const timer=setInterval(() => {
      const before=current.current;
      const after=before && finishExpiredMatch(before,serverNow());
      if (after) { history.current.push(structuredClone(before!)); current.current=after; resource.setData(after); }
    },100);
    return () => clearInterval(timer);
  },[sandbox,resource.setData]);
  const command=async (value?:Command,undo=false) => {
    if (!sandbox) return commands.current?.command(value,undo);
    const before=current.current;
    if (!before) return;
    try {
      let after: Match;
      if (undo) {
        const previous=history.current.pop();
        if (!previous) return;
        after=structuredClone(previous);
        pause(after,serverNow());
      } else {
        if (!value) return;
        after=applyCommand(before,value,serverNow());
        history.current.push(structuredClone(before));
        if (history.current.length>100) history.current.shift();
      }
      current.current=after;
      resource.setData(after);
      setNotice("");
    } catch (e) { setNotice((e as Error).message); }
  };
  return { ...resource, busy, notice, command };
}
export function useTournament(tournamentId: string) {
  const resource = useResource<{tournament:Tournament; matches:Match[]}>("tournaments/" + tournamentId + "/state");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function save(
    t: Tournament,
    newMatches: Match[] = [],
    updates: Match[] = [],
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      await api<Tournament>("tournaments/" + tournamentId, "PUT", {
          tournament: t,
          matches: newMatches,
          updates,
        });
      await resource.refresh();
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      await resource.refresh();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    ...resource,
    data: resource.data?.tournament ?? null,
    matches: resource.data?.matches ?? emptyMatches,
    save,
    busy,
    notice,
    setNotice,
  };
}
export type Session = { user: User | null; setup: boolean; serverTime: number };
let offset = 0;
export function syncTime(serverTime: number) {
  offset = serverTime - Date.now();
}
export const serverNow = () => Date.now() + offset;
export function useNow() {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function download(
  name: string,
  data: unknown,
  mime = "application/json",
) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
      { type: mime },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const navigate = (path: string) => {
  location.hash = path;
};

/** Diferenças de comportamento entre as versões, lidas pelas páginas em shared/. */
export const platform = {
  /** Visualizadores operam uma cópia temporária (preview) que não é salva. */
  viewerSandbox: true,
  /** Complemento do texto "removidos da base ___". */
  storageLabel: "na nuvem",
  /** Trava os controles do painel enquanto um comando está sendo salvo. */
  lockWhileSaving: false,
} as const;

/** Overlay de campeonato: a nuvem busca campeonato e partidas num só snapshot. */
export function useTournamentOverlayData(tournamentId: string) {
  const { data: snapshot, error } = useResource<{ tournament: Tournament; matches: Match[] }>(
    "tournaments/" + tournamentId + "/state",
  );
  return { t: snapshot?.tournament, ms: snapshot?.matches, error };
}
