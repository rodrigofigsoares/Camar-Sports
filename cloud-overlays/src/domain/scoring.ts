import { z } from "zod";
import {
  blankSide,
  clockSchema,
  createMatch,
  id,
  sideSchema,
  type Clock,
  type Match,
  type Side,
} from "./model.ts";

export function clockValue(c: Clock, now = Date.now()) {
  const delta =
    c.startedAt === null ? 0 : Math.max(0, now - c.startedAt) / 1000;
  return c.direction === "down"
    ? Math.max(0, c.value - delta)
    : Math.min(c.limit || 86400, c.value + delta);
}
export const playingTime = (m: Match, now = Date.now()) =>
  m.playElapsed +
  (m.playStartedAt === null
    ? 0
    : Math.min(
        Math.max(0, now - m.playStartedAt) / 1000,
        Math.max(0, m.clock.direction === "down"
          ? m.clock.value
          : (m.clock.limit || 86400) - m.clock.value),
      ));
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const isTennis = (m: Match) =>
  m.sport === "tennis" || m.sport === "beachtennis";
export const penaltyRemaining = (m: Match, expiresAtPlay: number, now = Date.now()) =>
  Math.min(120, Math.max(0, expiresAtPlay - playingTime(m, now)));
export function finishExpiredMatch(m: Match, now = Date.now()): Match | null {
  if (m.clock.startedAt === null || m.status === "done") return null;
  const autoFinishSports = ["handball", "football", "futsal", "basketball", "basketball3x3", "beachhandball"];
  if (!autoFinishSports.includes(m.sport)) return null;

  const remaining = m.clock.direction === "down" ? m.clock.value : (m.clock.limit || 86400) - m.clock.value;
  const endedAt = m.clock.startedAt + Math.max(0, remaining) * 1000;
  if (now < endedAt) return null;

  let isFinalPeriod = false;
  const p = m.period.trim().toUpperCase();
  if (["handball", "football", "futsal", "beachhandball"].includes(m.sport)) {
    isFinalPeriod = p === "2° TEMPO" || p === "2º TEMPO" || p === "2P";
  } else if (["basketball", "basketball3x3"].includes(m.sport)) {
    isFinalPeriod = p === "4° QUARTO" || p === "4º QUARTO" || p === "PRORROGAÇÃO";
  }

  if (isFinalPeriod && (m.a.score !== m.b.score || m.tiebreakWinner))
    return applyCommand(m, { type: "patch", patch: { status: "done" } }, endedAt);

  const stopped = structuredClone(m);
  pause(stopped, endedAt);
  return stopped;
}
export function handballWinner(m: Match): Side | null {
  if (m.sport !== "handball" || m.status !== "done") return null;
  if (m.a.score !== m.b.score) return m.a.score > m.b.score ? "a" : "b";
  return m.tiebreakWinner;
}
export function tennisWinner(m: Match): Side | null {
  if (!isTennis(m) || m.status !== "done") return null;
  const target = Math.floor(m.bestOf / 2) + 1;
  if (m.a.sets >= target && m.a.sets > m.b.sets) return "a";
  if (m.b.sets >= target && m.b.sets > m.a.sets) return "b";
  return null;
}
export const timeoutRemaining = (m: Match, now = Date.now()) =>
  m.activeTimeout
    ? Math.max(0, m.activeTimeout.seconds - Math.max(0, now - m.activeTimeout.startedAt) / 1000)
    : 0;
export const usesSets = (m: Match) =>
  isTennis(m) || m.sport === "volleyball" || m.sport === "beachhandball";
export const result = (m: Match, side: Side) =>
  usesSets(m) ? m[side].sets : m[side].score;
export function matchWinner(m: Match): Side | null {
  if (m.status !== "done") return null;
  const a = result(m, "a"), b = result(m, "b");
  return a === b ? m.tiebreakWinner : a > b ? "a" : "b";
}
export const shootoutPoints = (m: Match, side: Side) =>
  m[side].shootout.reduce(
    (total, shot) => total + (shot === "goal2" ? 2 : shot === "goal" ? 1 : 0),
    0,
  );
export const pointLabel = (m: Match, side: Side) =>
  isTennis(m)
    ? m.tiebreak
      ? m[side].points
      : (["0", "15", "30", "40", "AD"][m[side].points] ?? m[side].points)
    : m[side].score;
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setScore"),
    a: z.number().int().min(0).max(999),
    b: z.number().int().min(0).max(999),
  }),
  z.object({
    type: z.literal("score"),
    side: sideSchema,
    amount: z.number().int().min(-3).max(3),
  }),
  z.object({
    type: z.literal("counter"),
    side: sideSchema,
    field: z.enum(["sets", "games", "fouls", "points"]),
    amount: z.number().int().min(-1).max(1),
  }),
  z.object({
    type: z.literal("clock"),
    action: z.enum(["start", "pause", "reset", "adjust", "set"]),
    seconds: z.number().min(-86400).max(86400).optional(),
  }),
  z.object({ type: z.literal("clockConfig"), clock: clockSchema }),
  z.object({
    type: z.literal("shot"),
    seconds: z.number().min(1).max(99),
    side: sideSchema.optional(),
  }),
  z.object({
    type: z.literal("penalty"),
    side: sideSchema,
    player: z.string().trim().min(1).max(8),
    isRedCard: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("removePenalty"),
    side: sideSchema,
    id: z.string(),
  }),
  z.object({ type: z.literal("timeout"), side: sideSchema }),
  z.object({ type: z.literal("endTimeout") }),
  z.object({ type: z.literal("sevenMeters"), side: sideSchema }),
  z.object({
    type: z.literal("shootout"),
    side: sideSchema,
    index: z.number().int().min(0).max(99),
    result: z.enum(["pending", "goal", "goal2", "miss"]).optional(),
  }),
  z.object({ type: z.literal("extraShootout") }),
  z.object({ type: z.literal("configureShootout"), attempts: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal("removeExtraShootout") }),
  z.object({ type: z.literal("finishSet"), side: sideSchema }),
  z.object({ type: z.literal("reset") }),
  z.object({
    type: z.literal("patch"),
    patch: z.record(z.string(), z.unknown()),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function pause(m: Match, now: number) {
  m.playElapsed = playingTime(m, now);
  m.playStartedAt = null;
  m.clock = { ...m.clock, value: clockValue(m.clock, now), startedAt: null };
  m.shotClock = {
    ...m.shotClock,
    value: clockValue(m.shotClock, now),
    startedAt: null,
  };
}
export const setsToWin = (m: Match) => Math.floor(m.bestOf / 2) + 1;
function hasSetWinner(m: Match) {
  return usesSets(m) && Math.max(m.a.sets, m.b.sets) >= setsToWin(m);
}
function closeSetMatch(m: Match, now: number) {
  if (!hasSetWinner(m)) return;
  m.status = "done";
  m.period = "Fim de jogo";
  pause(m, now);
}
function finishSet(m: Match, side: Side, tennis = false, now = Date.now()) {
  if (!usesSets(m)) throw new Error("Esta modalidade não utiliza sets.");
  if (hasSetWinner(m) || m.status === "done")
    throw new Error("Partida encerrada. Corrija os sets antes de continuar.");
  if (tennis) m.tennisGame = { id: id(), side, at: now, kind: "set" };
  m.setHistory.push({
    a: tennis ? m.a.games : m.a.score,
    b: tennis ? m.b.games : m.b.score,
  });
  m[side].sets++;
  m.a.score = m.b.score = m.a.points = m.b.points = m.a.games = m.b.games = 0;
  m.tiebreak = false;
  if (m.sport === "beachhandball") {
    const next = m.setHistory.length + 1;
    m.period = next === 2 ? "2° TEMPO" : next === 3 ? "1P" : next === 4 ? "2P" : `${next}° TEMPO`;
  } else {
    m.period = `${m.setHistory.length + 1}º set`;
  }
  closeSetMatch(m, now);
}
function tennisPoint(m: Match, side: Side, now: number) {
  if (m.status === "done") throw new Error("Partida encerrada. Reabra a partida para corrigir a pontuação.");
  const other = side === "a" ? "b" : "a",
    a = m[side],
    b = m[other];
  if (a.games === 6 && b.games === 6) m.tiebreak = true;
  if (m.tiebreak) {
    const played = a.points + b.points;
    const firstServer = Math.floor((played + 1) / 2) % 2 === 0
      ? m.serve : m.serve === "a" ? "b" : "a";
    a.points++;
    if ((a.points + b.points) % 2 === 1) m.serve = m.serve === "a" ? "b" : "a";
    if (a.points >= 7 && a.points - b.points >= 2) {
      a.games++;
      m.serve = firstServer === "a" ? "b" : "a";
      finishSet(m, side, true, now);
    }
    return;
  }
  if (a.points < 3) {
    a.points++;
    return;
  }
  if (m.hasAdvantage && b.points === 4) {
    b.points = 3;
    return;
  }
  if (m.hasAdvantage && a.points === 3 && b.points === 3) {
    a.points = 4;
    return;
  }
  m.tennisGame = { id: id(), side, at: now, kind: m.serve === side ? "hold" : "break" };
  if (m.tennisGame.kind === "break") m.serveBreak = { id: m.tennisGame.id, side, at: now };
  a.games++;
  a.points = b.points = 0;
  m.serve = m.serve === "a" ? "b" : "a";
  if (a.games >= 6 && a.games - b.games >= 2) finishSet(m, side, true, now);
  else if (a.games === 6 && b.games === 6) m.tiebreak = true;
}
export function applyCommand(
  input: Match,
  command: Command,
  now = Date.now(),
): Match {
  const m = structuredClone(input),
    c = command;
  m.shootoutAttempts ??= 5;
  if (usesSets(m) && (m.status === "done" || hasSetWinner(m)) && (
    (c.type === "score" && c.amount > 0) ||
    (c.type === "counter" && c.amount > 0) ||
    (c.type === "clock" && c.action === "start")
  )) throw new Error("Partida encerrada. Corrija os sets e reabra a partida para continuar.");
  if (c.type === "setScore") {
    if (isTennis(m)) throw new Error("No tênis, ajuste pontos, games e sets pelos controles específicos.");
    if (m.status === "done") throw new Error("Reabra a partida antes de ajustar o placar.");
    // Correct the current score atomically; historical points must not award sets
    // or produce goal/victory cues. Period, clock and completed sets are retained.
    m.a.score = c.a;
    m.b.score = c.b;
    m.handballCue = null;
    m.victoryCue = null;
    return m;
  }
  if (c.type === "score") {
    if (isTennis(m)) {
      if (c.amount > 0) tennisPoint(m, c.side, now);
      else m[c.side].points = Math.max(0, m[c.side].points - 1);
    } else if (m.sport === "volleyball") {
      if (c.amount > 0) {
        const other = c.side === "a" ? "b" : "a";
        const isTiebreak = m.bestOf > 1 && m.a.sets + m.b.sets === m.bestOf - 1;
        const target = isTiebreak ? m.pointsTiebreak : m.pointsPerSet;
        if (m[c.side].score >= target && m[c.side].score - m[other].score >= 2 || m[other].score >= target && m[other].score - m[c.side].score >= 2) {
          throw new Error("O set já foi concluído com esta pontuação.");
        }
        m[c.side].score = Math.max(0, m[c.side].score + c.amount);
        m.serve = c.side;
        if (m[c.side].score >= target && m[c.side].score - m[other].score >= 2) {
          m.handballCue = { id: id(), side: c.side, kind: "set", at: now };
          finishSet(m, c.side, false, now);
        }
      } else {
        m[c.side].score = Math.max(0, m[c.side].score + c.amount);
      }
    } else {
      m[c.side].score = Math.max(0, m[c.side].score + c.amount);
      if (c.amount > 0 && (m.sport === "futsal" || m.sport === "football")) {
        m.handballCue = { id: id(), side: c.side, kind: "goal", at: now };
      }
    }
  } else if (c.type === "counter") {
    m[c.side][c.field] = Math.max(0, m[c.side][c.field] + c.amount);
    if (c.field === "sets" && c.amount > 0) closeSetMatch(m, now);
  } else if (c.type === "clock") {
    const correction = c.action === "adjust" || c.action === "set";
    const valueBefore = clockValue(m.clock, now);
    const wasRunning = m.clock.startedAt !== null && m.status !== "done" &&
      (m.clock.direction === "down" ? valueBefore > 0 : valueBefore < (m.clock.limit || 86400));
    const shotWasRunning = m.shotClock.startedAt !== null;
    pause(m, now);
    const oldValue = m.clock.value;
    if (c.action === "start") {
      if (
        m.clock.direction === "down"
          ? m.clock.value > 0
          : m.clock.value < (m.clock.limit || 86400)
      ) {
        m.clock.startedAt = now;
        m.playStartedAt = now;
        m.status = "live";
        m.activeTimeout = null;
        if (m.sport.startsWith("basketball") && m.shotClock.value > 0)
          m.shotClock.startedAt = now;
      }
    }
    if (c.action === "reset") {
      m.clock.value = m.clock.direction === "up" ? 0 : m.clock.limit;
      m.shotClock.value = m.shotClock.limit;
    }
    if (c.action === "adjust" || c.action === "set")
      m.clock.value = Math.max(
        0,
        Math.min(
          m.clock.limit || 86400,
          c.action === "set"
            ? (c.seconds ?? 0)
            : m.clock.value + (c.seconds ?? 0),
        ),
      );
    if (m.sport === "handball" && (c.action === "adjust" || c.action === "set"))
      m.playElapsed = Math.max(0, m.playElapsed + (m.clock.value - oldValue) * (m.clock.direction === "up" ? 1 : -1));
    if (correction && wasRunning &&
      (m.clock.direction === "down" ? m.clock.value > 0 : m.clock.value < (m.clock.limit || 86400))) {
      // Rebase at the correction instant, preserving continuous elapsed time.
      m.clock.startedAt = now;
      m.playStartedAt = now;
      if (shotWasRunning && m.shotClock.value > 0) m.shotClock.startedAt = now;
    }
  } else if (c.type === "clockConfig") {
    pause(m, now);
    m.clock = { ...c.clock, startedAt: null };
  } else if (c.type === "shot") {
    m.shotClock = {
      value: c.seconds,
      limit: c.seconds,
      direction: "down",
      startedAt: m.clock.startedAt === null ? null : now,
    };
    if (c.side) m.possession = c.side;
  } else if (c.type === "penalty")
    m[c.side].penalties.push({
      id: id(),
      player: c.player,
      expiresAtPlay: playingTime(m, now) + 120,
      isRedCard: c.isRedCard ?? false,
    });
  else if (c.type === "removePenalty")
    m[c.side].penalties = m[c.side].penalties.filter((p) => p.id !== c.id);
  else if (c.type === "timeout") {
    const i = m[c.side].timeouts.indexOf(false);
    if (i === -1) throw new Error("A equipe já utilizou os três tempos.");
    pause(m, now);
    m[c.side].timeouts[i] = true;
    m.activeTimeout = { side: c.side, startedAt: now, seconds: 60 };
  } else if (c.type === "sevenMeters") {
    if (m.sport !== "handball") throw new Error("Indicação de 7 metros exclusiva do handebol.");
    if (m.status === "done") throw new Error("Partida encerrada.");
    m.handballCue = { id: id(), side: c.side, kind: "seven", at: now };
  } else if (c.type === "endTimeout") m.activeTimeout = null;
  else if (c.type === "shootout") {
    const shots = m[c.side].shootout;
    if (c.index >= shots.length) throw new Error("Cobrança inválida.");
    if (c.result === "goal2" && m.sport !== "beachhandball")
      throw new Error(
        "Cobranças de dois pontos são exclusivas do beach handball.",
      );
    const cycle =
      m.sport === "beachhandball"
        ? (["pending", "goal", "goal2", "miss"] as const)
        : (["pending", "goal", "miss"] as const);
    shots[c.index] =
      c.result ??
      cycle[(cycle.indexOf(shots[c.index] as "goal") + 1) % cycle.length];
  } else if (c.type === "configureShootout") {
    for (const side of ["a", "b"] as const) {
      if (m[side].shootout.slice(c.attempts).some((shot) => shot !== "pending"))
        throw new Error("Não é possível remover cobranças com resultado. Corrija as bolinhas para pendente antes de reduzir a quantidade.");
      m[side].shootout = Array.from({ length: c.attempts }, (_, i) => m[side].shootout[i] ?? "pending");
    }
    m.shootoutAttempts = c.attempts;
  } else if (c.type === "extraShootout") {
    if (m.a.shootout.length >= 100 || m.b.shootout.length >= 100)
      throw new Error("Limite de cobranças atingido.");
    m.a.shootout.push("pending");
    m.b.shootout.push("pending");
  } else if (c.type === "removeExtraShootout") {
    if (m.a.shootout.length > m.shootoutAttempts && m.b.shootout.length > m.shootoutAttempts) {
      m.a.shootout.pop();
      m.b.shootout.pop();
    }
  } else if (c.type === "finishSet") {
    finishSet(m, c.side, isTennis(m), now);
    pause(m, now);
  } else if (c.type === "reset") {
    const fresh = createMatch(m.sport, m.a.team, m.b.team);
    fresh.shootoutAttempts = m.shootoutAttempts;
    fresh.bestOf = m.bestOf;
    fresh.hasAdvantage = m.hasAdvantage;
    fresh.a.shootout = Array(m.shootoutAttempts).fill("pending");
    fresh.b.shootout = Array(m.shootoutAttempts).fill("pending");
    Object.assign(m, fresh, {
      id: input.id,
      revision: input.revision,
      createdAt: input.createdAt,
      tournamentId: input.tournamentId,
      stageId: input.stageId,
      slotA: input.slotA,
      slotB: input.slotB,
      category: input.category,
      title: input.title,
      scheduledAt: input.scheduledAt,
      venue: input.venue,
    });
  } else if (c.type === "patch") {
    const allowed = [
      "title",
      "category",
      "scheduledAt",
      "venue",
      "period",
      "possession",
      "serve",
      "visible",
      "penaltyMode",
      "bestOf",
      "pointsPerSet",
      "pointsTiebreak",
      "autoSetPoint",
      "hasAdvantage",
      "tiebreak",
      "tiebreakWinner",
      "status",
      "a",
      "b",
      "teamA",
      "teamB",
    ];
    for (const key of Object.keys(c.patch))
      if (!allowed.includes(key)) throw new Error("Campo não editável: " + key);
    const { teamA, teamB, ...patch } = c.patch;
    const autoFinishSports = ["handball", "football", "futsal", "basketball", "basketball3x3", "beachhandball"];
    if (autoFinishSports.includes(m.sport) && typeof patch.period === "string" && patch.period !== m.period) {
      pause(m, now);
      m.clock.value = m.clock.direction === "up" ? 0 : m.clock.limit;
    }
    if ("possession" in patch && patch.possession !== m.possession && m.sport.startsWith("basketball")) {
      m.shotClock = {
        ...m.shotClock,
        value: m.shotClock.limit,
        startedAt: m.clock.startedAt === null ? null : now,
      };
    }
    Object.assign(m, patch);
    if (teamA) m.a.team = teamA as Match["a"]["team"];
    if (teamB) m.b.team = teamB as Match["b"]["team"];
    if (m.status === "done") pause(m, now);
    if ("bestOf" in patch) closeSetMatch(m, now);
  }
  const winner = matchWinner(m);
  if (winner && (input.status !== "done" || matchWinner(input) !== winner))
    m.victoryCue = { id: id(), side: winner, at: now };
  else if (!winner) m.victoryCue = null;
  if (m.sport === "handball") {
    const winner = handballWinner(m);
    if (winner && (input.status !== "done" || handballWinner(input) !== winner))
      m.handballCue = { id: id(), side: winner, kind: "victory", at: now };
    else if (input.status === "done" && (!winner || m.status !== "done")) m.handballCue = null;
  }
  return m;
}
export function resetParticipants(
  m: Match,
  a: Match["a"]["team"],
  b: Match["b"]["team"],
): Match {
  const fresh = applyCommand(m, { type: "reset" });
  return { ...fresh, a: { ...blankSide(a), shootout: fresh.a.shootout }, b: { ...blankSide(b), shootout: fresh.b.shootout } };
}
