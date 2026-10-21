import { DurableObject } from 'cloudflare:workers';

/** One notification room per competition (or standalone match). D1 owns all
 * authoritative data. Hibernation keeps idle sockets without a running timer. */
export class LiveRoom extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', {status:426});
    if (this.ctx.getWebSockets().length >= 128)
      return new Response('Too many connections', {status:429});
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, {status:101, webSocket:pair[0]});
  }

  // RPC binding only: browsers cannot invoke this by sending socket messages.
  notify(): void {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send('{"type":"changed"}'); }
      catch { socket.close(1011, 'Reconnect'); }
    }
  }
  webSocketMessage(socket: WebSocket): void {
    socket.close(1008, 'Read-only connection');
  }
  webSocketClose(socket: WebSocket, code: number): void { socket.close([1005,1006,1015].includes(code)?1000:code); }
  webSocketError(socket: WebSocket): void { socket.close(1011, 'Reconnect'); }
}
