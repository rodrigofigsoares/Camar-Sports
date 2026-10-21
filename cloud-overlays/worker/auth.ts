import { z } from 'zod';
import { D1Repository } from './repository';
import { HttpError, json, type Env, type StoredUser } from './types';

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const publicUser = ({passwordHash: _, ...user}: StoredUser) => user;
const tokenOf = (req: Request) => /(?:^|;\s*)camar_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('Cookie') ?? '')?.[1];
async function digest(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256)));
}
export async function hash(password: string) {
  const salt = random();
  return `pbkdf2-sha256:100000:${salt}:${await derive(password,salt)}`;
}
async function verify(password: string, stored: string) {
  const [algorithm, iterations, salt, expected] = stored.split(':');
  if (algorithm !== 'pbkdf2-sha256' || iterations !== '100000' || !salt || !expected) return false;
  const actual = await derive(password, salt);
  let diff = actual.length ^ expected.length;
  for (let i=0;i<actual.length;i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export async function session(req: Request, env: Env): Promise<StoredUser | undefined> {
  const token = tokenOf(req);
  if (!token) return;
  const row = await env.DB.prepare(`SELECT e.payload FROM sessions s JOIN entities e ON e.kind='user' AND e.id=s.user_id
    WHERE s.token=? AND s.expires_at>?`).bind(await digest(token), Date.now()).first<{payload: string}>();
  if (!row) return;
  const user: StoredUser = JSON.parse(row.payload);
  return user.disabled ? undefined : user;
}
export async function auth(req: Request, env: Env, resource: string): Promise<Response | undefined> {
  const method = req.method;
  if (resource === 'session' && method === 'GET') {
    const user = await session(req, env);
    const exists = await env.DB.prepare("SELECT 1 FROM entities WHERE kind='user' LIMIT 1").first();
    return json({ user: user ? publicUser(user) : null, setup: !exists, serverTime: Date.now() });
  }
  if (resource === 'logout' && method === 'POST') {
    const token = tokenOf(req);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await digest(token)).run();
    return json({ok:true}, 200, {'Set-Cookie': 'camar_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
  }
  if ((resource !== 'login' && resource !== 'setup') || method !== 'POST') return;
  const data = z.object({ username:z.string().min(3).max(40), password:z.string().min(8).max(200), name:z.string().min(1).max(80).optional(), setupToken:z.string().optional() }).parse(await req.json());
  const key = await digest(req.headers.get('CF-Connecting-IP') ?? 'local');
  const now = Date.now();
  // Reserve an attempt atomically before expensive password work, across isolates.
  const rate = await env.DB.prepare(`INSERT INTO login_attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key)
    DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END,until=CASE WHEN until<=? THEN excluded.until ELSE until END RETURNING count`)
    .bind(key,now+300000,now,now).first<{count:number}>();
  if (!rate || rate.count>10) throw new HttpError(429,'Muitas tentativas. Aguarde 5 minutos.');
  let user: StoredUser;
  let repo: D1Repository | undefined;
  if (resource === 'setup') {
    if (!env.SETUP_TOKEN || data.setupToken !== env.SETUP_TOKEN) throw new HttpError(403,'Código de instalação inválido.');
    repo = await D1Repository.load(env.DB,'setup');
    if (repo.list('user').length) throw new HttpError(409,'O administrador já foi configurado.');
    user = { id:crypto.randomUUID(), username:data.username, name:data.name ?? data.username, role:'admin', sports:[], disabled:false, passwordHash:await hash(data.password) };
    repo.put('user',user);
  } else {
    const row = await env.DB.prepare("SELECT payload FROM entities WHERE username=? AND username IS NOT NULL").bind(data.username.toLowerCase()).first<{payload:string}>();
    const candidate: StoredUser | undefined = row ? JSON.parse(row.payload) : undefined;
    if (!candidate || candidate.disabled || !(await verify(data.password,candidate.passwordHash))) throw new HttpError(401,'Usuário ou senha inválidos.');
    user = candidate;
  }
  const token = random();
  const statements = [
    env.DB.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),user.id,now+7*86400000),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE key=? OR until<=?').bind(key,now),
  ];
  if (repo) await repo.commit(statements); else await env.DB.batch(statements);
  return json(publicUser(user),200,{'Set-Cookie':`camar_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`});
}
