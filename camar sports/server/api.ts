import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  createMatch,
  createTournament,
  id,
  matchSchema,
  sportSchema,
  teamSchema,
  tournamentSchema,
  userSchema,
  type Match,
  type Tournament,
  type User,
} from "../src/domain/model.ts";
import {
  applyCommand,
  commandSchema,
  pause,
  resetParticipants,
  result,
  finishExpiredMatch,
} from "../src/domain/scoring.ts";
import { resolve, validateTournament } from "../src/domain/tournament.ts";
import { SqliteRepository } from "./repository.ts";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
type StoredUser = User & { passwordHash: string };
const publicUser = ({ passwordHash: _, ...u }: StoredUser): User => u;
const hash = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
};
const verify = (password: string, value: string) => {
  const [salt, h] = value.split(":");
  const a = Buffer.from(h, "hex"),
    b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
};
async function body(req: IncomingMessage): Promise<unknown> {
  let value = "";
  for await (const part of req) {
    value += part;
    if (value.length > 12_000_000)
      throw new HttpError(413, "Arquivo excede 12 MB.");
  }
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}
export function createApi(repo = new SqliteRepository()) {
  const streams = new Set<ServerResponse>();
  const notify = () => {
    for (const res of streams)
      res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
  };
  const heartbeat = setInterval(() => {
    for (const res of streams) res.write(": ping\n\n");
  }, 20000);
  heartbeat.unref();
  const clockTicker = setInterval(() => {
    try {
    const expired = repo.list<Match>("match").map(m => ({ before: m, after: finishExpiredMatch(m) })).filter(x => x.after);
    if (!expired.length) return;
    repo.transaction(() => {
      const tournaments = new Set<string>();
      for (const { before, after } of expired) {
        const m = after!;
        repo.pushHistory(before);
        m.revision = before.revision + 1;
        repo.put("match", m);
        if (m.tournamentId) tournaments.add(m.tournamentId);
      }
      for (const tid of tournaments) {
        const t = repo.get<Tournament>("tournament", tid);
        if (!t) continue;
        t.revision++;
        synchronize(t, repo.list<Match>("match").filter(m => m.tournamentId === tid));
        repo.put("tournament", t);
      }
    });
    notify();
    } catch (error) {
      console.error("Não foi possível encerrar o cronômetro da partida:", error);
    }
  }, 250);
  clockTicker.unref();
  const attempts = new Map<string, { count: number; until: number }>();
  function session(req: IncomingMessage) {
    const token = /(?:^|;\s*)camar_session=([a-f0-9]+)/.exec(
      req.headers.cookie ?? "",
    )?.[1];
    if (!token) return;
    const row = repo.db
      .prepare("SELECT user_id FROM sessions WHERE token=? AND expires_at>?")
      .get(token, Date.now()) as { user_id: string } | undefined;
    const u = row ? repo.get<StoredUser>("user", row.user_id) : undefined;
    return u && !u.disabled ? u : undefined;
  }
  function checkRevision(expected: number, actual: number) {
    assert(
      expected === actual,
      "Outra janela alterou estes dados. A versão atual foi recarregada; revise e tente novamente.",
      409,
    );
  }
  function synchronize(t: Tournament, all: Match[]) {
    for (let pass = 0; pass <= t.stages.length; pass++) {
      const resolved = resolve(t, all);
      let changed = false;
      for (const s of t.stages)
        for (const mid of s.matchIds) {
          const index = all.findIndex((m) => m.id === mid);
          if (index < 0) continue;
          const m = all[index];
          let ta = t.teams.find(
            (x) => x.id === resolved[s.id].slots[m.slotA ?? 0],
          ) ?? {
            id: `pending-${s.id}-${m.slotA}`,
            name: "A definir",
            shortName: "A definir",
            color: "#333333",
            textColor: "#ffffff",
          };
          let tb = t.teams.find(
            (x) => x.id === resolved[s.id].slots[m.slotB ?? 1],
          ) ?? {
            id: `pending-${s.id}-${m.slotB}`,
            name: "A definir",
            shortName: "A definir",
            color: "#333333",
            textColor: "#ffffff",
          };
          // Uniform colors belong to this match, not the tournament roster.
          if (m.a.team.id === ta.id)
            ta = {
              ...ta,
              color: m.a.team.color,
              textColor: m.a.team.textColor,
            };
          if (m.b.team.id === tb.id)
            tb = {
              ...tb,
              color: m.b.team.color,
              textColor: m.b.team.textColor,
            };
          if (m.a.team.id !== ta.id || m.b.team.id !== tb.id) {
            all[index] = {
              ...resetParticipants(m, ta, tb),
              category: s.category,
              revision: m.revision + 1,
            };
            repo.clearHistory(m.id);
            repo.put("match", all[index]);
            changed = true;
          } else if (
            m.category !== s.category ||
            JSON.stringify(m.a.team) !== JSON.stringify(ta) ||
            JSON.stringify(m.b.team) !== JSON.stringify(tb)
          ) {
            all[index] = {
              ...m,
              category: s.category,
              a: { ...m.a, team: ta },
              b: { ...m.b, team: tb },
              revision: m.revision + 1,
            };
            repo.put("match", all[index]);
          }
        }
      if (!changed) break;
    }
    validateTournament(t, all);
  }
  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    next?: () => void,
  ) {
    const url = new URL(req.url ?? "/", "http://localhost"),
      path = url.pathname.split("/").filter(Boolean);
    if (path[0] !== "api") {
      next?.();
      return;
    }
    const send = (value: unknown, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const method = req.method ?? "GET",
        u = session(req),
        resource = path[1],
        entityId = path[2];
      if (method !== "GET") {
        const origin = req.headers.origin;
        assert(
          !origin || new URL(origin).host === req.headers.host,
          "Origem não permitida.",
          403,
        );
      }
      if (resource === "events" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write("data: {}\n\n");
        streams.add(res);
        req.on("close", () => streams.delete(res));
        return;
      }
      if (resource === "session" && method === "GET")
        return send({
          user: u ? publicUser(u) : null,
          setup: repo.list("user").length === 0,
          serverTime: Date.now(),
        });
      if ((resource === "login" || resource === "setup") && method === "POST") {
        const data = z
          .object({
            username: z.string().min(3).max(40),
            password: z.string().min(8).max(200),
            name: z.string().min(1).max(80).optional(),
          })
          .parse(await body(req));
        let user: StoredUser | undefined;
        if (resource === "setup") {
          assert(
            repo.list("user").length === 0,
            "O administrador já foi configurado.",
            409,
          );
          user = {
            id: id(),
            name: data.name ?? data.username,
            username: data.username,
            role: "admin",
            sports: [],
            disabled: false,
            passwordHash: hash(data.password),
          };
          repo.put("user", user);
        } else {
          const key = req.socket.remoteAddress ?? "local",
            rate = attempts.get(key);
          assert(
            !rate || rate.count < 10 || rate.until < Date.now(),
            "Muitas tentativas. Aguarde 5 minutos.",
            429,
          );
          user = repo
            .list<StoredUser>("user")
            .find(
              (x) => x.username.toLowerCase() === data.username.toLowerCase(),
            );
          if (
            !user ||
            user.disabled ||
            !verify(data.password, user.passwordHash)
          ) {
            attempts.set(key, {
              count: (rate && rate.until > Date.now() ? rate.count : 0) + 1,
              until: Date.now() + 300000,
            });
            throw new HttpError(401, "Usuário ou senha inválidos.");
          }
          attempts.delete(key);
        }
        const token = randomBytes(32).toString("hex");
        repo.db
          .prepare("INSERT INTO sessions VALUES(?,?,?)")
          .run(token, user.id, Date.now() + 7 * 86400000);
        res.setHeader(
          "Set-Cookie",
          `camar_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,
        );
        return send(publicUser(user));
      }
      if (resource === "logout" && method === "POST") {
        const token = /camar_session=([a-f0-9]+)/.exec(
          req.headers.cookie ?? "",
        )?.[1];
        if (token)
          repo.db.prepare("DELETE FROM sessions WHERE token=?").run(token);
        res.setHeader(
          "Set-Cookie",
          "camar_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        return send({ ok: true });
      }
      const admin = () =>
        assert(u?.role === "admin", "Acesso reservado ao administrador.", 403);
      const edit = (sport?: Match["sport"]) => {
        assert(
          u && u.role !== "viewer",
          "Entre com um perfil de operação.",
          403,
        );
        assert(
          u!.role === "admin" ||
            !sport ||
            u!.sports.length === 0 ||
            u!.sports.includes(sport),
          "Modalidade não autorizada para este usuário.",
          403,
        );
      };
      if (method !== "GET") {
        const origin = req.headers.origin;
        assert(
          !origin || new URL(origin).host === req.headers.host,
          "Origem não permitida.",
          403,
        );
      }
      if (resource === "users") {
        admin();
        if (method === "GET")
          return send(repo.list<StoredUser>("user").map(publicUser));
        const data = z
          .object({
            user: userSchema,
            password: z.string().min(8).max(200).optional(),
          })
          .parse(await body(req));
        const old = repo.get<StoredUser>("user", data.user.id);
        assert(
          !repo
            .list<StoredUser>("user")
            .some(
              (x) =>
                x.id !== data.user.id &&
                x.username.toLowerCase() === data.user.username.toLowerCase(),
            ),
          "Nome de usuário já cadastrado.",
        );
        assert(
          data.user.id !== u!.id ||
            (data.user.role === "admin" && !data.user.disabled),
          "Você não pode remover seu próprio acesso administrativo.",
        );
        assert(old || data.password, "Defina uma senha para o novo usuário.");
        repo.put("user", {
          ...data.user,
          passwordHash: data.password ? hash(data.password) : old!.passwordHash,
        });
        notify();
        return send(data.user);
      }
      if (resource === "backup") {
        admin();
        if (method === "GET")
          return send({
            version: 2,
            exportedAt: new Date().toISOString(),
            matches: repo.list("match"),
            tournaments: repo.list("tournament"),
          });
        const data = z
          .object({
            version: z.literal(2),
            matches: z.array(matchSchema),
            tournaments: z.array(tournamentSchema),
          })
          .parse(await body(req));
        assert(
          new Set(data.matches.map((m) => m.id)).size === data.matches.length &&
            new Set(data.tournaments.map((t) => t.id)).size ===
              data.tournaments.length,
          "IDs duplicados no backup.",
        );
        data.tournaments.forEach((t) => validateTournament(t, data.matches));
        assert(
          data.matches.every(
            (m) =>
              !m.tournamentId ||
              data.tournaments.some(
                (t) =>
                  t.id === m.tournamentId &&
                  t.stages.some(
                    (s) => s.id === m.stageId && s.matchIds.includes(m.id),
                  ),
              ),
          ),
          "Partida sem campeonato/fase correspondente.",
        );
        repo.transaction(() => {
          for (const t of data.tournaments)
            assert(
              !repo.get("tournament", t.id),
              "Este campeonato já existe. Restaure em uma base vazia ou importe um backup diferente.",
              409,
            );
          for (const m of data.matches)
            assert(!repo.get("match", m.id), "Esta partida já existe.", 409);
          data.tournaments.forEach((t) => repo.put("tournament", t));
          data.matches.forEach((m) => {
            pause(m, Date.now());
            repo.put("match", m);
          });
        });
        notify();
        return send({ ok: true });
      }
      if (resource === "matches") {
        if (method === "GET") {
          if (entityId) {
            const m = repo.get<Match>("match", entityId);
            assert(m, "Partida não encontrada.", 404);
            return send(m);
          }
          return send(
            repo
              .list<Match>("match")
              .filter(
                (m) =>
                  !url.searchParams.get("tournament") ||
                  m.tournamentId === url.searchParams.get("tournament"),
              ),
          );
        }
        if (method === "POST" && !entityId) {
          const data = z
            .object({
              sport: sportSchema,
              a: teamSchema.optional(),
              b: teamSchema.optional(),
              title: z.string().max(120).optional(),
            })
            .parse(await body(req));
          edit(data.sport);
          const m = createMatch(data.sport, data.a, data.b);
          m.title = data.title ?? "";
          repo.put("match", m);
          notify();
          return send(m, 201);
        }
        const current = repo.get<Match>("match", entityId);
        assert(current, "Partida não encontrada.", 404);
        edit(current!.sport);
        const data = z
          .object({
            revision: z.number().int(),
            command: commandSchema.optional(),
          })
          .parse(await body(req));
        checkRevision(data.revision, current!.revision);
        if (method === "DELETE") {
          assert(
            !current!.tournamentId,
            "Remova a partida dentro da fase do campeonato.",
          );
          repo.transaction(() => {
            repo.remove("match", entityId);
            repo.clearHistory(entityId);
          });
          notify();
          return send({ ok: true });
        }
        const saved = repo.transaction(() => {
          let m: Match;
          if (path[3] === "undo") {
            const previous = repo.popHistory(entityId);
            assert(previous, "Nenhuma ação para desfazer.");
            m = previous!;
            pause(m, Date.now());
          } else {
            assert(data.command, "Comando ausente.");
            repo.pushHistory(current!);
            m = matchSchema.parse(applyCommand(current!, data.command!));
          }
          if (m.tournamentId) {
            assert(
              m.a.team.id === current!.a.team.id &&
                m.b.team.id === current!.b.team.id,
              "Altere os participantes na fase do campeonato.",
            );
            assert(
              !(
                m.status !== "scheduled" &&
                (m.a.team.id.startsWith("pending-") ||
                  m.b.team.id.startsWith("pending-"))
              ),
              "Aguarde a definição dos participantes.",
            );
            const t = repo.get<Tournament>("tournament", m.tournamentId)!;
            const stage = t.stages.find((s) => s.id === m.stageId)!;
            assert(
              !(
                stage.kind === "knockout" &&
                m.status === "done" &&
                result(m, "a") === result(m, "b") &&
                !m.tiebreakWinner
              ),
              "Selecione o vencedor no desempate.",
            );
          }
          m.revision = current!.revision + 1;
          repo.put("match", m);
          if (m.tournamentId) {
            const t = repo.get<Tournament>("tournament", m.tournamentId)!;
            t.revision++;
            synchronize(
              t,
              repo.list<Match>("match").filter((x) => x.tournamentId === t.id),
            );
            repo.put("tournament", t);
          }
          return repo.get<Match>("match", m.id);
        });
        notify();
        return send(saved);
      }
      if (resource === "tournaments") {
        if (method === "GET") {
          if (entityId) {
            const t = repo.get("tournament", entityId);
            assert(t, "Campeonato não encontrado.", 404);
            return send(t);
          }
          return send(repo.list("tournament"));
        }
        if (method === "POST" && !entityId) {
          const data = z
            .object({
              name: z.string().trim().min(1).max(100),
              organizer: z.string().trim().max(100).default(""),
              sport: sportSchema,
            })
            .parse(await body(req));
          edit(data.sport);
          const t = createTournament(data.name, data.sport);
          t.organizer = data.organizer;
          repo.put("tournament", t);
          notify();
          return send(t, 201);
        }
        const current = repo.get<Tournament>("tournament", entityId);
        assert(current, "Campeonato não encontrado.", 404);
        edit(current!.sport);
        if (method === "DELETE") {
          const data = z
            .object({ revision: z.number() })
            .parse(await body(req));
          checkRevision(data.revision, current!.revision);
          repo.transaction(() => {
            repo.remove("tournament", entityId);
            for (const m of repo
              .list<Match>("match")
              .filter((m) => m.tournamentId === entityId)) {
              repo.remove("match", m.id);
              repo.clearHistory(m.id);
            }
          });
          notify();
          return send({ ok: true });
        }
        const data = z
          .object({
            tournament: tournamentSchema,
            matches: z.array(matchSchema).default([]),
            updates: z.array(matchSchema).default([]),
          })
          .parse(await body(req));
        checkRevision(data.tournament.revision, current!.revision);
        assert(
          data.tournament.id === entityId &&
            data.tournament.sport === current!.sport,
          "Não é possível alterar ID ou modalidade.",
        );
        repo.transaction(() => {
          const updatedIds = new Set<string>();
          for (const update of data.updates) {
            const previous = repo.get<Match>("match", update.id);
            assert(
              previous &&
                previous.tournamentId === entityId &&
                !updatedIds.has(update.id),
              "Partida de resultado inválida ou repetida.",
            );
            updatedIds.add(update.id);
            checkRevision(update.revision, previous!.revision);
            assert(
              update.stageId === previous!.stageId &&
                update.a.team.id === previous!.a.team.id &&
                update.b.team.id === previous!.b.team.id,
              "Os participantes do resultado foram alterados. Reimporte o CSV atualizado.",
            );
            assert(
              !previous!.a.team.id.startsWith("pending-") &&
                !previous!.b.team.id.startsWith("pending-"),
              "Defina os participantes antes de importar resultados.",
            );
            const m = structuredClone(previous!);
            m.a.score = update.a.score;
            m.b.score = update.b.score;
            m.a.sets = update.a.sets;
            m.b.sets = update.b.sets;
            m.setHistory = update.setHistory;
            m.status = update.status;
            if (m.status === "done") pause(m, Date.now());
            m.revision++;
            repo.pushHistory(previous!);
            repo.put("match", m);
          }
          for (const m of data.matches) {
            assert(
              m.tournamentId === entityId && !repo.get("match", m.id),
              "Nova partida inválida ou já existente.",
            );
            repo.put("match", m);
          }
          for (const m of repo
            .list<Match>("match")
            .filter((m) => m.tournamentId === entityId))
            if (
              !data.tournament.stages.some((s) => s.matchIds.includes(m.id))
            ) {
              repo.remove("match", m.id);
              repo.clearHistory(m.id);
            }
          const all = repo
            .list<Match>("match")
            .filter((m) => m.tournamentId === entityId);
          synchronize(data.tournament, all);
          data.tournament.revision++;
          repo.put("tournament", data.tournament);
        });
        notify();
        return send(data.tournament);
      }
      throw new HttpError(404, "Rota não encontrada.");
    } catch (e) {
      send(
        {
          error:
            e instanceof z.ZodError
              ? "Dados inválidos: " +
                e.issues
                  .map((x) => `${x.path.join(".")}: ${x.message}`)
                  .join("; ")
              : e instanceof Error
                ? e.message
                : "Erro inesperado.",
        },
        e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 400,
      );
    }
  }
  return {
    handle,
    close: () => {
      clearInterval(heartbeat);
      clearInterval(clockTicker);
      streams.forEach((s) => s.end());
      repo.db.close();
    },
  };
}
