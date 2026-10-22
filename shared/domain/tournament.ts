import {
  createMatch,
  id,
  team,
  type Match,
  type Stage,
  type Team,
  type Tournament,
} from "./model.ts";
import { result } from "./scoring.ts";

export function removeStages(t: Tournament, stageIds: string[]): Tournament {
  const removed = new Set(stageIds);
  return {
    ...t,
    stages: t.stages.filter((s) => !removed.has(s.id)),
    links: t.links.filter(
      (l) => !removed.has(l.source) && !removed.has(l.target),
    ),
  };
}

export type Standing = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
  difference: number;
  points: number;
  ratio: number;
  setPointsDifference: number;
  setPointsScored: number;
  setPointsRatio: number;
};
export type Resolved = {
  slots: (string | null)[];
  standings: Standing[];
  outputs: Record<string, string | null>;
  complete: boolean;
};
export const outputs = (s: Stage) =>
  s.kind === "knockout"
    ? ["winner", "loser"]
    : Array.from({ length: s.advance }, (_, i) => `rank-${i + 1}`);
export const outputLabel = (s: string) =>
  s === "winner"
    ? "Vencedor"
    : s === "loser"
      ? "Perdedor"
      : `${s.slice(5)}º colocado`;
export function editStage(t: Tournament, next: Stage): Tournament {
  const previous = t.stages.find((s) => s.id === next.id);
  if (!previous) throw new Error("Fase inexistente.");
  if (
    next.kind === "knockout" &&
    (next.seeds.length !== 2 || next.matchIds.length > 1)
  )
    throw new Error(
      "Um confronto eliminatório precisa de duas vagas e no máximo uma partida. Esta fase reúne vários jogos; mantenha-os em fases individuais dentro de um conjunto.",
    );
  if (next.kind === "swiss" && next.seeds.length % 2 !== 0)
    throw new Error("O formato suíço exige um número par de vagas.");
  const links = t.links.map((l) => {
    if (l.source !== next.id || previous.kind === next.kind) return l;
    const output =
      next.kind === "knockout"
        ? ({ "rank-1": "winner", "rank-2": "loser" }[l.output] ?? l.output)
        : previous.kind === "knockout"
          ? ({ winner: "rank-1", loser: "rank-2" }[l.output] ?? l.output)
          : l.output;
    return { ...l, output };
  });
  if (
    links.some((l) => l.source === next.id && !outputs(next).includes(l.output))
  )
    throw new Error(
      "O novo formato não oferece todas as saídas conectadas. Ajuste os classificados ou desconecte essas saídas antes de salvar.",
    );
  return {
    ...t,
    stages: t.stages.map((s) => (s.id === next.id ? next : s)),
    links,
  };
}
export function standings(
  t: Tournament,
  s: Stage,
  slots: (string | null)[],
  matches: Match[],
  includeLive = false,
): Standing[] {
  const rows = slots
    .filter((v): v is string => !!v)
    .map((teamId) => ({
      teamId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scored: 0,
      conceded: 0,
      difference: 0,
      points: 0,
      ratio: 0,
      setPointsDifference: 0,
      setPointsScored: 0,
      setPointsRatio: 0,
    }));
  const done = matches.filter(
    (m) => s.matchIds.includes(m.id) && (m.status === "done" || (includeLive && m.status === "live")),
  );
  for (const m of done) {
    const a = rows.find((r) => r.teamId === slots[m.slotA ?? 0]),
      b = rows.find((r) => r.teamId === slots[m.slotB ?? 1]);
    if (!a || !b) continue;
    for (const set of m.setHistory) {
      a.setPointsScored += set.a;
      b.setPointsScored += set.b;
      a.setPointsDifference += set.a - set.b;
      b.setPointsDifference += set.b - set.a;
    }
    const x = result(m, "a"),
      y = result(m, "b");
    for (const [r, scored, conceded] of [
      [a, x, y],
      [b, y, x],
    ] as [Standing, number, number][]) {
      r.played++;
      r.scored += scored;
      r.conceded += conceded;
      r.wins += +(scored > conceded);
      r.draws += +(scored === conceded);
      r.losses += +(scored < conceded);
      r.points += t.scoring.volleyball
        ? scored > conceded
          ? conceded >= Math.floor(m.bestOf / 2)
            ? 2
            : 3
          : scored >= Math.floor(m.bestOf / 2)
            ? 1
            : 0
        : scored > conceded
          ? t.scoring.win
          : scored === conceded
            ? t.scoring.draw
            : t.scoring.loss;
      r.difference = r.scored - r.conceded;
      r.ratio = r.conceded ? r.scored / r.conceded : r.scored;
    }
  }
  for (const row of rows) {
    const against = row.setPointsScored - row.setPointsDifference;
    row.setPointsRatio = against
      ? row.setPointsScored / against
      : row.setPointsScored;
  }
  // Build one mini-table for the entire points-tied group. Pairwise comparisons
  // can be cyclic (A beats B, B beats C, C beats A) and are not a valid sort.
  const mini = new Map<
    string,
    { points: number; difference: number; scored: number }
  >();
  for (const row of rows)
    mini.set(row.teamId, { points: 0, difference: 0, scored: 0 });
  for (const m of done) {
    const a = rows.find((r) => r.teamId === slots[m.slotA ?? 0]);
    const b = rows.find((r) => r.teamId === slots[m.slotB ?? 1]);
    if (!a || !b || a.points !== b.points) continue;
    const x = result(m, "a"),
      y = result(m, "b");
    for (const [r, scored, conceded] of [
      [a, x, y],
      [b, y, x],
    ] as [Standing, number, number][]) {
      const stats = mini.get(r.teamId)!;
      stats.scored += scored;
      stats.difference += scored - conceded;
      stats.points += t.scoring.volleyball
        ? scored > conceded
          ? conceded >= Math.floor(m.bestOf / 2)
            ? 2
            : 3
          : scored >= Math.floor(m.bestOf / 2)
            ? 1
            : 0
        : scored > conceded
          ? t.scoring.win
          : scored === conceded
            ? t.scoring.draw
            : t.scoring.loss;
    }
  }
  const rules = s.tiebreakers ?? t.scoring.tiebreakers;
  const value = (row: Standing, rule: (typeof rules)[number]) => {
    const stats = mini.get(row.teamId)!;
    if (rule === "headToHead") return stats.points;
    if (rule === "headDifference") return stats.difference;
    if (rule === "headScored") return stats.scored;
    if (rule === "conceded") return -row.conceded;
    return row[rule];
  };
  return rows.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    for (const rule of rules) {
      const difference = value(b, rule) - value(a, rule);
      if (difference) return difference;
    }
    return (
      t.teams.find((x) => x.id === a.teamId)?.name ?? a.teamId
    ).localeCompare(
      t.teams.find((x) => x.id === b.teamId)?.name ?? b.teamId,
      "pt-BR",
    );
  });
}
export function resolve(
  t: Tournament,
  matches: Match[],
  provisional = false,
): Record<string, Resolved> {
  const cache: Record<string, Resolved> = {},
    visiting = new Set<string>();
  function visit(s: Stage): Resolved {
    if (cache[s.id]) return cache[s.id];
    if (visiting.has(s.id))
      throw new Error("As conexões não podem formar ciclos.");
    visiting.add(s.id);
    const slots = [...s.seeds];
    for (const l of t.links.filter((l) => l.target === s.id)) {
      const parent = t.stages.find((p) => p.id === l.source);
      if (!parent) throw new Error("Fase de origem inexistente.");
      slots[l.slot] = visit(parent).outputs[l.output] ?? null;
    }
    const ms = s.matchIds
      .map((mid) => matches.find((m) => m.id === mid))
      .filter((m): m is Match => !!m);
    const table = standings(t, s, slots, matches, provisional);
    let complete =
      slots.every(Boolean) &&
      ms.length > 0 &&
      ms.length === s.matchIds.length &&
      ms.every((m) => m.status === "done");
    const out: Resolved["outputs"] = {};
    if (s.kind === "knockout") {
      const m = ms[0],
        a = m ? result(m, "a") : 0,
        b = m ? result(m, "b") : 0;
      if (complete && a === b && !m.tiebreakWinner) complete = false;
      const winning =
        a === b ? (m?.tiebreakWinner === "a" ? 0 : 1) : a > b ? 0 : 1;
      const liveWinner = provisional && m?.status === "live" && a !== b &&
        m.a.team.id === slots[0] && m.b.team.id === slots[1];
      out.winner = complete || liveWinner ? slots[winning] : null;
      out.loser = complete || liveWinner ? slots[1 - winning] : null;
      // A first-round bye is structural, never an unresolved incoming qualifier.
      if (
        slots.filter(Boolean).length === 1 &&
        !t.links.some((l) => l.target === s.id)
      ) {
        complete = true;
        out.winner = slots.find(Boolean) ?? null;
      }
    } else
      outputs(s).forEach((key, i) => {
        out[key] = complete || (provisional && table.some(row => row.played > 0))
          ? (table[i]?.teamId ?? null) : null;
      });
    visiting.delete(s.id);
    return (cache[s.id] = { slots, standings: table, outputs: out, complete });
  }
  t.stages.forEach(visit);
  return cache;
}
export function validateTournament(t: Tournament, matches: Match[]) {
  const unique = (ids: string[]) => ids.length === new Set(ids).size;
  if (
    !unique(t.teams.map((x) => x.id)) ||
    !unique(t.stages.map((x) => x.id)) ||
    !unique(t.links.map((x) => x.id)) ||
    !unique(t.groups.map((x) => x.id))
  )
    throw new Error("Identificadores duplicados.");
  for (const g of t.groups) {
    const seen = new Set<string>();
    let p: typeof g | undefined = g;
    while (p) {
      if (seen.has(p.id)) throw new Error("Conjuntos não podem formar ciclos.");
      seen.add(p.id);
      const next: string | null = p.parentId;
      if (next && !t.groups.some((x) => x.id === next))
        throw new Error("Conjunto superior inexistente.");
      p = t.groups.find((x) => x.id === next);
    }
  }
  for (const s of t.stages) {
    if (s.kind === "knockout" && s.seeds.length !== 2)
      throw new Error("Cada confronto eliminatório precisa de duas vagas.");
    if (s.advance > s.seeds.length)
      throw new Error("Número de classificados inválido.");
    if (s.groupId && !t.groups.some((g) => g.id === s.groupId))
      throw new Error("Conjunto inexistente.");
    if (s.seeds.some((x) => x && !t.teams.some((team) => team.id === x)))
      throw new Error("Equipe inexistente.");
    if (!t.categories.includes(s.category))
      throw new Error("Categoria da fase inexistente.");
    if (s.kind === "swiss" && s.seeds.length % 2 !== 0)
      throw new Error("O formato suíço exige um número par de vagas.");
    if (!unique(s.matchIds)) throw new Error("Partidas duplicadas na fase.");
  }
  const inputs = new Set<string>(),
    sourceOutputs = new Set<string>();
  for (const l of t.links) {
    const a = t.stages.find((s) => s.id === l.source),
      b = t.stages.find((s) => s.id === l.target);
    if (
      !a ||
      !b ||
      a.id === b.id ||
      !outputs(a).includes(l.output) ||
      l.slot >= b.seeds.length
    )
      throw new Error("Conexão inválida.");
    const input = `${l.target}/${l.slot}`,
      output = `${l.source}/${l.output}`;
    if (inputs.has(input) || sourceOutputs.has(output))
      throw new Error("Esta entrada ou saída já está conectada.");
    inputs.add(input);
    sourceOutputs.add(output);
  }
  const resolved = resolve(t, matches);
  for (const s of t.stages) {
    const slots = resolved[s.id].slots.filter((v): v is string => !!v);
    if (!unique(slots))
      throw new Error("Uma equipe não pode ocupar duas vagas na mesma fase.");
    for (const mid of s.matchIds) {
      const m = matches.find((m) => m.id === mid);
      if (!m) throw new Error("Partida inexistente.");
      if (m.tournamentId !== t.id || m.stageId !== s.id || m.sport !== t.sport)
        throw new Error("Partida vinculada a outra fase ou modalidade.");
      if (
        (m.slotA ?? 0) >= s.seeds.length ||
        (m.slotB ?? 1) >= s.seeds.length ||
        m.slotA === m.slotB
      )
        throw new Error("Confronto inválido.");
    }
  }
}
export function newStage(
  name: string,
  kind: Stage["kind"],
  seeds: (string | null)[],
  category = "Principal",
  index = 0,
): Stage {
  return {
    id: id(),
    name,
    kind,
    category,
    seeds,
    groupId: null,
    rounds: 1,
    advance: Math.min(2, seeds.length),
    position: { x: Math.floor(index / 3) * 360, y: (index % 3) * 320 },
    matchIds: [],
  };
}
export function fixtures(
  t: Tournament,
  s: Stage,
  existing: Match[] = [],
): Match[] {
  const pairs: [number, number][] = [];
  if (s.kind === "knockout") pairs.push([0, 1]);
  else if (s.kind === "swiss") {
    const table = standings(t, s, s.seeds, existing),
      slots = table.map((r) => s.seeds.indexOf(r.teamId));
    while (slots.length > 1) {
      const a = slots.shift()!;
      let bi = slots.findIndex(
        (b) =>
          !existing.some(
            (m) =>
              m.stageId === s.id &&
              ((m.slotA === a && m.slotB === b) ||
                (m.slotA === b && m.slotB === a)),
          ),
      );
      if (bi < 0) bi = 0;
      pairs.push([a, slots.splice(bi, 1)[0]]);
    }
  } else {
    for (let a = 0; a < s.seeds.length; a++)
      for (let b = a + 1; b < s.seeds.length; b++) pairs.push([a, b]);
    if (s.rounds === 2)
      pairs.push(...pairs.map(([a, b]): [number, number] => [b, a]));
  }
  return pairs.map(([a, b]) => ({
    ...createMatch(
      t.sport,
      t.teams.find((x) => x.id === s.seeds[a]) ?? {
        ...team("A definir"),
        id: `pending-${s.id}-${a}`,
      },
      t.teams.find((x) => x.id === s.seeds[b]) ?? {
        ...team("A definir", 1),
        id: `pending-${s.id}-${b}`,
      },
    ),
    tournamentId: t.id,
    stageId: s.id,
    slotA: a,
    slotB: b,
    category: s.category,
  }));
}
export type Format =
  "single" | "double" | "ladder" | "groups" | "league" | "return" | "swiss";
export function generate(
  tournament: Tournament,
  format: Format,
  teams: Team[],
  category: string,
  pairing: "seeded" | "sequential" | "random" = "seeded",
): { tournament: Tournament; matches: Match[] } {
  if (teams.length < 2) throw new Error("Selecione pelo menos duas equipes.");
  if (format === "double" && ![4, 8, 16, 32].includes(teams.length))
    throw new Error("Eliminação dupla: selecione 4, 8, 16 ou 32 equipes.");
  if (format === "swiss" && teams.length % 2)
    throw new Error("O formato suíço exige um número par de equipes.");
  const t = structuredClone(tournament),
    ms: Match[] = [];
  const groupId = id();
  t.groups.push({
    id: groupId,
    name: `${category} · ${["single", "double"].includes(format) ? "Eliminatórias" : "Competição"}`,
    parentId: null,
  });
  const add = (
    name: string,
    kind: Stage["kind"],
    seeds: (string | null)[],
    x = 0,
    y = 0,
  ) => {
    const s = newStage(name, kind, seeds, category, t.stages.length);
    s.groupId = groupId;
    s.position = { x, y: y + tournament.stages.length * 80 };
    if (format === "return") s.rounds = 2;
    const games = fixtures(t, s);
    s.matchIds = games.map((m) => m.id);
    ms.push(...games);
    t.stages.push(s);
    return s;
  };
  const link = (a: Stage, output: string, b: Stage, slot: number) =>
    t.links.push({ id: id(), source: a.id, output, target: b.id, slot });
  const seeds = teams.map((x) => x.id);
  if (pairing === "random")
    for (let i = seeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
    }
  if (["league", "return", "swiss"].includes(format))
    add(category, format === "swiss" ? "swiss" : "league", seeds);
  else if (format === "groups") {
    const n = Math.max(1, Math.ceil(seeds.length / 4));
    for (let i = 0; i < n; i++) {
      const group = seeds.filter((_, j) => j % n === i);
      if (group.length > 1)
        add(
          `Grupo ${String.fromCharCode(65 + i)}`,
          "group",
          group,
          (i % 3) * 360,
          Math.floor(i / 3) * 350,
        );
    }
  } else if (format === "ladder") {
    let previous = add("Escalada 1", "knockout", seeds.slice(-2), 0, 0);
    for (let i = seeds.length - 3; i >= 0; i--) {
      const next = add(
        i === 0 ? "Final" : `Escalada ${seeds.length - i - 1}`,
        "knockout",
        [seeds[i], null],
        (seeds.length - i - 2) * 360,
        0,
      );
      link(previous, "winner", next, 1);
      previous = next;
    }
  } else {
    const size = 2 ** Math.ceil(Math.log2(seeds.length)),
      padded: (string | null)[] = [
        ...seeds,
        ...Array(size - seeds.length).fill(null),
      ];
    let round: Stage[] = [];
    const byes = size - seeds.length;
    for (let i = 0; i < size / 2; i++) {
      const offset = byes + (i - byes) * 2;
      const pair =
        pairing === "seeded"
          ? [padded[i], padded[size - i - 1]]
          : i < byes
            ? [seeds[i], null]
            : [seeds[offset], seeds[offset + 1]];
      round.push(
        add(
          size === 2 ? "Final" : `Rodada 1 · ${i + 1}`,
          "knockout",
          pair,
          0,
          i * 290,
        ),
      );
    }
    const winnerRounds = [round];
    let r = 1;
    while (round.length > 1) {
      const next: Stage[] = [];
      for (let i = 0; i < round.length / 2; i++) {
        const s = add(
          round.length === 2 ? "Final" : `Rodada ${r + 1} · ${i + 1}`,
          "knockout",
          [null, null],
          r * 360,
          i * 420,
        );
        link(round[2 * i], "winner", s, 0);
        link(round[2 * i + 1], "winner", s, 1);
        next.push(s);
      }
      round = next;
      winnerRounds.push(round);
      r++;
    }
    if (format === "double") {
      let lower: Stage[] = [];
      for (let i = 0; i < winnerRounds[0].length / 2; i++) {
        const s = add(
          `Repescagem 1 · ${i + 1}`,
          "knockout",
          [null, null],
          0,
          size * 160 + i * 280,
        );
        link(winnerRounds[0][2 * i], "loser", s, 0);
        link(winnerRounds[0][2 * i + 1], "loser", s, 1);
        lower.push(s);
      }
      for (let j = 1; j < winnerRounds.length; j++) {
        const merged: Stage[] = [];
        for (let i = 0; i < lower.length; i++) {
          const s = add(
            `Repescagem ${j * 2} · ${i + 1}`,
            "knockout",
            [null, null],
            (j * 2 - 1) * 360,
            size * 160 + i * 280,
          );
          link(lower[i], "winner", s, 0);
          link(winnerRounds[j][winnerRounds[j].length - i - 1], "loser", s, 1);
          merged.push(s);
        }
        lower = merged;
        if (lower.length > 1) {
          const condensed: Stage[] = [];
          for (let i = 0; i < lower.length / 2; i++) {
            const s = add(
              `Repescagem ${j * 2 + 1} · ${i + 1}`,
              "knockout",
              [null, null],
              j * 720,
              size * 160 + i * 400,
            );
            link(lower[2 * i], "winner", s, 0);
            link(lower[2 * i + 1], "winner", s, 1);
            condensed.push(s);
          }
          lower = condensed;
        }
      }
      const final = add(
        "Grande final",
        "knockout",
        [null, null],
        (r * 2 - 1) * 360,
        0,
      );
      link(round[0], "winner", final, 0);
      link(lower[0], "winner", final, 1);
    }
  }
  return { tournament: t, matches: ms };
}

/** Provisional overlay tables never change official qualification or participants. */
export function resolveOverlay(t: Tournament, matches: Match[]): Record<string, Resolved> {
  const resolved = resolve(t, matches);
  if (t.overlay.liveStandings) {
    for (const stage of t.stages) {
      if (stage.kind !== "knockout") {
        resolved[stage.id].standings = standings(t, stage, resolved[stage.id].slots, matches, true);
      }
    }
  }
  return resolved;
}
