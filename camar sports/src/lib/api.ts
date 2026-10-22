import { MatchCommands } from '../../../shared/lib/match-commands';
import { uppercaseTeams } from "../../../shared/lib/team-text";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Command } from "../../../shared/domain/scoring";
import type { Match, Tournament, User } from "../../../shared/domain/model";
const emptyMatches: Match[] = [];

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
  const res = await fetch("/api/" + path, {
    method,
    headers:
      value === undefined ? undefined : { "Content-Type": "application/json" },
    body: value === undefined ? undefined : JSON.stringify(uppercaseTeams(value)),
  });
  const data = uppercaseTeams(await res.json());
  if (!res.ok)
    throw new ApiError(data.error ?? "Não foi possível salvar.", res.status);
  return data;
}
export function useResource<T>(path: string, suspended?: {current: boolean}) {
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
    void refresh();
    const events = new EventSource("/api/events");
    events.onmessage = () => void refresh();
    events.onerror = () => setConnected(false);
    const timer = setInterval(refresh, 10000);
    return () => {
      generation.current++;
      events.close();
      clearInterval(timer);
    };
  }, [refresh]);
  return { data, setData: replaceData, error, connected, refresh };
}
export function useMatch(matchId: string) {
  const suspended=useRef(false);
  const resource = useResource<Match>("matches/" + matchId,suspended),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const current=useRef(resource.data);
  current.current=resource.data;
  const commands=useRef<MatchCommands|null>(null);
  useEffect(()=>{
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
  },[matchId,resource.setData]);
  const wasBusy=useRef(false);
  useEffect(()=>{
    if(wasBusy.current && !busy) void resource.refresh();
    wasBusy.current=busy;
  },[busy,resource.refresh]);
  const command=(value?:Command,undo=false)=>commands.current?.command(value,undo)??Promise.resolve();
  return { ...resource, busy, notice, command };
}
export function useTournament(tournamentId: string) {
  const resource = useResource<Tournament>("tournaments/" + tournamentId),
    matches = useResource<Match[]>("matches?tournament=" + tournamentId);
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
      resource.setData(
        await api<Tournament>("tournaments/" + tournamentId, "PUT", {
          tournament: t,
          matches: newMatches,
          updates,
        }),
      );
      await matches.refresh();
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      await resource.refresh();
      await matches.refresh();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    ...resource,
    matches: matches.data ?? emptyMatches,
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
