/** Notifications contain no scores. Every event reloads the committed D1 state. */
export function liveResource(path: string): string | null {
  if (/^(matches|tournaments)\/[a-zA-Z0-9_-]{1,128}(?:\/state)?$/.test(path)) return path;
  return null;
}

export function subscribeLive(resource: string, changed: () => void) {
  let socket: WebSocket | undefined;
  let stopped = false, attempt = 0, lastMessage = Date.now();
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  function connect() {
    if (stopped) return;
    const url = new URL('/api/live', location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('resource', resource);
    let current: WebSocket;
    try { current = new WebSocket(url); }
    catch { retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5))); return; }
    socket = current;
    const disconnected = () => {
      if (socket !== current) return;
      socket = undefined;
      clearInterval(heartbeat);
      if (!stopped) retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)));
    };
    current.onopen = () => {
      if (stopped || socket !== current) { current.close(); return; }
      attempt = 0; lastMessage = Date.now();
      // Fetch again after subscribe: covers changes between initial read and handshake.
      changed();
      heartbeat = setInterval(() => {
        if (Date.now() - lastMessage > 45000) { current.close(); disconnected(); }
        else if (current.readyState === WebSocket.OPEN) current.send('ping');
      }, 20000);
    };
    current.onmessage = event => {
      if (stopped || socket !== current) return;
      lastMessage = Date.now();
      if (event.data === 'pong') return;
      try { if (JSON.parse(event.data).type === 'changed') changed(); } catch { /* Ignore unknown frames. */ }
    };
    current.onerror = () => { current.close(); disconnected(); };
    current.onclose = disconnected;
  }
  connect();
  return {
    isOpen: () => !!socket && socket.readyState === WebSocket.OPEN,
    close() {
      stopped = true;
      clearTimeout(retry); clearInterval(heartbeat);
      socket?.close(); socket = undefined;
    },
  };
}

/** Schedule a read at a running clock's end, instead of polling every second. */
export function nextClockEnd(data: unknown, now: number): number | null {
  const root=data as {matches?: unknown[]; clock?: unknown} | null;
  const matches=Array.isArray(root?.matches)?root.matches:root?.clock?[root]:[];
  let end=Infinity;
  for(const item of matches) {
    const m=item as {status?:string; clock?:{startedAt:number|null;direction:string;value:number;limit:number}};
    if(!m.clock || m.clock.startedAt===null || m.status==='done') continue;
    const remaining=m.clock.direction==='down'?m.clock.value:(m.clock.limit||86400)-m.clock.value;
    const deadline=m.clock.startedAt+Math.max(0,remaining)*1000;
    if(deadline>now) end=Math.min(end,deadline);
  }
  return Number.isFinite(end)?end:null;
}
