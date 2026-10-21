import { z } from "zod";

export const sports = {
  handball: {
    name: "Handebol",
    icon: "◉",
    duration: 1800,
    direction: "up",
    period: "1° TEMPO",
  },
  football: {
    name: "Futebol / Fut 7",
    icon: "◎",
    duration: 2700,
    direction: "up",
    period: "1° TEMPO",
  },
  futsal: {
    name: "Futsal",
    icon: "◈",
    duration: 1200,
    direction: "down",
    period: "1° TEMPO",
  },
  basketball: {
    name: "Basquetebol",
    icon: "◍",
    duration: 600,
    direction: "down",
    period: "1° QUARTO",
  },
  basketball3x3: {
    name: "Basquete 3×3",
    icon: "◍",
    duration: 600,
    direction: "down",
    period: "1° QUARTO",
  },
  volleyball: {
    name: "Voleibol",
    icon: "◒",
    duration: 0,
    direction: "up",
    period: "1º set",
  },
  beachhandball: {
    name: "Beach handball",
    icon: "◉",
    duration: 600,
    direction: "down",
    period: "1° TEMPO",
  },
  tennis: {
    name: "Tênis",
    icon: "◐",
    duration: 0,
    direction: "up",
    period: "1º set",
  },
  beachtennis: {
    name: "Beach tennis",
    icon: "◐",
    duration: 0,
    direction: "up",
    period: "1º set",
  },
} as const;
export type Sport = keyof typeof sports;
export const sportSchema = z.enum(Object.keys(sports) as [Sport, ...Sport[]]);
export const sideSchema = z.enum(["a", "b"]);
export type Side = z.infer<typeof sideSchema>;
export const id = () => crypto.randomUUID();
const count = z.number().int().min(0).max(9999);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
// Normalize legacy/imported text colors to the closest permitted neutral.
export function monochromeText(value: string): string {
  const channels = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  return channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 >= 128
    ? "#ffffff"
    : "#000000";
}
export const teamSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  shortName: z.string().max(24),
  color,
  textColor: color.transform(monochromeText),
  cheer: z.string().trim().max(80).optional(),
});
export type Team = z.infer<typeof teamSchema>;
export const team = (name = "Equipe", index = 0): Team => ({
  id: id(),
  name,
  shortName: name.slice(0, 16),
  color: ["#254f46", "#454471", "#714a35", "#395e7c"][index % 4],
  textColor: "#ffffff",
});
export const clockSchema = z.object({
  value: z.number().min(0).max(86400),
  startedAt: z.number().nullable(),
  direction: z.enum(["up", "down"]),
  limit: z.number().min(0).max(86400),
});
export type Clock = z.infer<typeof clockSchema>;
export const sideStateSchema = z.object({
  team: teamSchema,
  score: count,
  sets: count,
  games: count,
  points: count,
  fouls: count,
  timeouts: z.array(z.boolean()).length(3),
  penalties: z.array(
    z.object({
      id: z.string(),
      player: z.string().min(1).max(8),
      expiresAtPlay: z.number(),
      isRedCard: z.boolean().optional(),
    }),
  ),
  shootout: z.array(z.enum(["pending", "goal", "goal2", "miss"])).max(100),
});
export const matchSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative(),
  sport: sportSchema,
  title: z.string().max(120),
  status: z.enum(["scheduled", "live", "done"]),
  createdAt: z.number(),
  tournamentId: z.string().optional(),
  stageId: z.string().optional(),
  slotA: count.optional(),
  slotB: count.optional(),
  category: z.string().max(80),
  scheduledAt: z.string().max(40),
  venue: z.string().max(120),
  a: sideStateSchema,
  b: sideStateSchema,
  clock: clockSchema,
  shotClock: clockSchema,
  playElapsed: z.number().min(0),
  playStartedAt: z.number().nullable(),
  period: z.string().min(1).max(40),
  possession: sideSchema.nullable(),
  serve: sideSchema,
  visible: z.boolean(),
  penaltyMode: z.boolean(),
  shootoutAttempts: z.number().int().min(1).max(20).default(5),
  activeTimeout: z
    .object({
      side: sideSchema,
      startedAt: z.number(),
      seconds: z.number().min(1).max(300),
    })
    .nullable(),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  pointsPerSet: z.number().int().min(1).max(100),
  pointsTiebreak: z.number().int().min(1).max(100),
  autoSetPoint: z.boolean(),
  hasAdvantage: z.boolean(),
  tiebreak: z.boolean(),
  serveBreak: z.object({ id: z.string(), side: sideSchema, at: z.number() }).nullable().default(null),
  tennisGame: z.object({ id: z.string(), side: sideSchema, at: z.number(), kind: z.enum(["break", "hold", "set"]) }).nullable().default(null),
  handballCue: z.object({ id: z.string(), side: sideSchema, at: z.number(), kind: z.enum(["seven", "victory", "set", "goal"]) }).nullable().default(null),
  victoryCue: z.object({ id: z.string(), side: sideSchema, at: z.number() }).nullable().default(null),
  tiebreakWinner: sideSchema.nullable(),
  setHistory: z.array(z.object({ a: count, b: count })),
});
export type Match = z.infer<typeof matchSchema>;
export const blankSide = (t: Team) => ({
  team: t,
  score: 0,
  sets: 0,
  games: 0,
  points: 0,
  fouls: 0,
  timeouts: [false, false, false],
  penalties: [],
  shootout: Array(5).fill("pending") as (
    "pending" | "goal" | "goal2" | "miss"
  )[],
});
export function createMatch(
  sport: Sport,
  a = team("Equipe A"),
  b = team("Equipe B", 1),
): Match {
  const s = sports[sport];
  return {
    id: id(),
    revision: 0,
    sport,
    title: "",
    status: "scheduled",
    createdAt: Date.now(),
    category: "",
    scheduledAt: "",
    venue: "",
    a: blankSide(a),
    b: blankSide(b),
    clock: {
      value: s.direction === "up" ? 0 : s.duration,
      startedAt: null,
      direction: s.direction,
      limit: s.duration,
    },
    shotClock: {
      value: sport === "basketball3x3" ? 12 : 30,
      startedAt: null,
      direction: "down",
      limit: sport === "basketball3x3" ? 12 : 30,
    },
    playElapsed: 0,
    playStartedAt: null,
    period: s.period,
    possession: null,
    serve: "a",
    visible: true,
    penaltyMode: false,
    shootoutAttempts: 5,
    activeTimeout: null,
    bestOf: 3,
    pointsPerSet: 25,
    pointsTiebreak: 15,
    autoSetPoint: true,
    hasAdvantage: sport !== "beachtennis",
    tiebreak: false,
    serveBreak: null,
    tennisGame: null,
    handballCue: null,
    victoryCue: null,
    tiebreakWinner: null,
    setHistory: [],
  };
}
export const tiebreakerSchema = z.enum([
  "wins",
  "difference",
  "scored",
  "conceded",
  "headToHead",
  "headDifference",
  "headScored",
  "ratio",
  "setPointsDifference",
  "setPointsScored",
  "setPointsRatio",
]);
export type Tiebreaker = z.infer<typeof tiebreakerSchema>;
export const tiebreakerLabels: Record<Tiebreaker, string> = {
  wins: "Mais vitórias",
  difference: "Saldo de gols/pontos geral",
  scored: "Mais gols/pontos marcados",
  conceded: "Menos gols/pontos sofridos",
  ratio: "Goal average geral",
  headToHead: "Pontos nos confrontos entre empatados",
  headDifference: "Saldo nos confrontos entre empatados",
  headScored: "Gols/pontos marcados entre empatados",
  setPointsDifference: "Saldo de pontos dentro dos sets",
  setPointsScored: "Pontos marcados dentro dos sets",
  setPointsRatio: "Quociente de pontos dentro dos sets",
};
export function tiebreakLabelsForSport(
  sport: Sport,
): Partial<Record<Tiebreaker, string>> {
  const sets = [
    "volleyball",
    "tennis",
    "beachtennis",
    "beachhandball",
  ].includes(sport);
  const unit = sets
    ? "sets"
    : ["handball", "football", "futsal"].includes(sport)
      ? "gols"
      : "pontos";
  const labels = {
    ...tiebreakerLabels,
    difference: `Saldo de ${unit} geral`,
    scored: `Mais ${unit} a favor`,
    conceded: `Menos ${unit} contra`,
    ratio: `Quociente de ${unit}`,
    headDifference: `Saldo de ${unit} entre empatados`,
    headScored: `${unit} a favor entre empatados`,
  };
  if (sport === "tennis" || sport === "beachtennis") {
    labels.setPointsDifference = "Saldo de games nos sets concluídos";
    labels.setPointsScored = "Games ganhos nos sets concluídos";
    labels.setPointsRatio = "Quociente de games nos sets concluídos";
  }
  if (sets) return labels;
  const {
    setPointsDifference,
    setPointsScored,
    setPointsRatio,
    ...withoutSets
  } = labels;
  return withoutSets;
}
const tiebreakersSchema = z
  .array(tiebreakerSchema)
  .max(11)
  .refine((r) => new Set(r).size === r.length, "Critérios repetidos.");
export const stageSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["group", "league", "knockout", "swiss"]),
  category: z.string().max(80),
  groupId: z.string().nullable(),
  tiebreakers: tiebreakersSchema.optional(),
  seeds: z.array(z.string().nullable()).min(2).max(64),
  rounds: z.union([z.literal(1), z.literal(2)]),
  advance: z.number().int().min(1).max(64),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  matchIds: z.array(z.string()),
});
export type Stage = z.infer<typeof stageSchema>;
export const tournamentSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(100),
  organizer: z.string().max(100),
  sport: sportSchema,
  createdAt: z.number(),
  teams: z.array(teamSchema).max(256),
  categories: z.array(z.string().min(1).max(80)).max(64),
  stages: z.array(stageSchema).max(256),
  groups: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80),
        parentId: z.string().nullable(),
      }),
    )
    .max(128),
  links: z
    .array(
      z.object({
        id: z.string(),
        source: z.string(),
        target: z.string(),
        output: z.string(),
        slot: z.number().int().min(0).max(63),
      }),
    )
    .max(1024),
  scoring: z.object({
    win: count,
    draw: count,
    loss: count,
    volleyball: z.boolean(),
    tiebreakers: tiebreakersSchema,
  }),
  overlay: z.object({
    visible: z.boolean(),
    liveStandings: z.boolean().optional(),
    liveBracket: z.boolean().optional(),
    seconds: z.number().int().min(3).max(120),
    screens: z.array(z.enum(["standings", "bracket", "results", "upcoming"])),
    stageIds: z.array(z.string()),
    groupIds: z.array(z.string()).optional(),
    category: z.string(),
  }),
});
export type Tournament = z.infer<typeof tournamentSchema>;
export function createTournament(name: string, sport: Sport): Tournament {
  return {
    id: id(),
    revision: 0,
    name,
    sport,
    organizer: "",
    createdAt: Date.now(),
    teams: [],
    categories: ["Principal"],
    stages: [],
    groups: [],
    links: [],
    scoring: {
      win: sport === "handball" || sport.startsWith("basketball") ? 2 : 3,
      draw: 1,
      loss: 0,
      volleyball: sport === "volleyball",
      tiebreakers: ["wins", "difference", "scored"],
    },
    overlay: {
      visible: true,
      seconds: 8,
      screens: ["standings", "results", "upcoming"],
      stageIds: [],
      category: "",
    },
  };
}
export const userSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(3).max(40),
  role: z.enum(["admin", "operator", "viewer"]),
  sports: z.array(sportSchema),
  disabled: z.boolean(),
});
export type User = z.infer<typeof userSchema>;
