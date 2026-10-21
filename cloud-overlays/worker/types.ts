import type { User } from '../src/domain/model';
import type { LiveRoom } from './live-room';
export type StoredUser = User & { passwordHash: string };
export type Env = Omit<Cloudflare.Env, 'LIVE_ROOMS'> & { LIVE_ROOMS: DurableObjectNamespace<LiveRoom> };
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
