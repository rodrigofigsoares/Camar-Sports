import { describe, expect, it } from "vitest";
import {
  createMatch,
  createTournament,
  team,
  sports,
  tiebreakLabelsForSport,
  type Sport,
  type Match,
} from "./model";
import { newStage, standings } from "./tournament";

function setup(names: string[]) {
  const t = createTournament("Desempate", "handball");
  t.teams = names.map((n) => team(n));
  t.scoring.win = 2;
  t.scoring.draw = 1;
  t.scoring.loss = 0;
  const s = newStage(
    "Classificatória",
    "group",
    t.teams.map((t) => t.id),
  );
  t.stages = [s];
  const matches: Match[] = [];
  const add = (a: number, b: number, x: number, y: number) => {
    const m = createMatch("handball", t.teams[a], t.teams[b]);
    m.slotA = a;
    m.slotB = b;
    m.a.score = x;
    m.b.score = y;
    m.status = "done";
    m.stageId = s.id;
    m.tournamentId = t.id;
    matches.push(m);
    s.matchIds.push(m.id);
  };
  const order = () =>
    standings(t, s, s.seeds, matches).map(
      (r) => t.teams.find((t) => t.id === r.teamId)!.name,
    );
  return { t, s, matches, add, order };
}
describe("desempates por tabela entre empatados", () => {
  it.each(Object.keys(sports) as Sport[])(
    "oferece critérios próprios para %s",
    (sport) => {
      const labels = tiebreakLabelsForSport(sport);
      expect(labels.headToHead).toBeDefined();
      expect(labels.wins).toBeDefined();
      expect(!!labels.setPointsRatio).toBe(
        ["volleyball", "tennis", "beachtennis", "beachhandball"].includes(
          sport,
        ),
      );
    },
  );
  it("distingue sets vencidos de pontos marcados nos sets do vôlei", () => {
    const f = setup(["A", "B", "C"]);
    f.t.sport = "volleyball";
    f.add(0, 2, 0, 0);
    f.add(1, 2, 0, 0);
    for (const m of f.matches) {
      m.sport = "volleyball";
      m.a.sets = 2;
      m.b.sets = 0;
    }
    f.matches[0].setHistory = [
      { a: 25, b: 23 },
      { a: 25, b: 23 },
    ];
    f.matches[1].setHistory = [
      { a: 25, b: 10 },
      { a: 25, b: 10 },
    ];
    f.s.tiebreakers = ["setPointsRatio"];
    expect(f.order().slice(0, 2)).toEqual(["B", "A"]);
    const rows = standings(f.t, f.s, f.s.seeds, f.matches);
    expect(rows[0].scored).toBe(2);
    expect(rows[0].setPointsScored).toBe(50);
  });
  it("prioriza HANDESFA, Mega e Alpha com os confrontos diretos do boletim, mesmo com saldo geral diferente", () => {
    const f = setup(["HANDESFA", "Mega", "Alpha", "Apoio"]);
    // Placares dos três confrontos publicados; jogos auxiliares apenas igualam pontos.
    f.add(0, 1, 25, 20);
    f.add(0, 2, 21, 14);
    f.add(1, 2, 22, 20);
    f.add(0, 3, 0, 1);
    f.add(0, 3, 0, 1);
    f.add(1, 3, 100, 0);
    f.add(1, 3, 0, 1);
    f.add(2, 3, 1, 0);
    f.add(2, 3, 1, 0);
    f.t.scoring.tiebreakers = ["difference"];
    expect(f.order().filter((n) => n !== "Apoio")).toEqual([
      "Mega",
      "HANDESFA",
      "Alpha",
    ]);
    f.s.tiebreakers = [
      "headToHead",
      "headDifference",
      "headScored",
      "difference",
    ];
    expect(f.order().filter((n) => n !== "Apoio")).toEqual([
      "HANDESFA",
      "Mega",
      "Alpha",
    ]);
  });
  it("resolve empate circular sem depender da ordem das equipes ou jogos", () => {
    const f = setup(["A", "B", "C"]);
    f.add(0, 1, 3, 0);
    f.add(1, 2, 2, 0);
    f.add(2, 0, 1, 0);
    f.t.scoring.tiebreakers = ["headToHead", "headDifference", "headScored"];
    expect(f.order()).toEqual(["A", "B", "C"]);
    f.t.teams.reverse();
    f.matches.reverse();
    expect(f.order()).toEqual(["A", "B", "C"]);
  });
  it("aceita menos gols sofridos e critérios diferentes por fase", () => {
    const f = setup(["A", "B", "C"]);
    f.add(0, 2, 3, 1);
    f.add(1, 2, 1, 0);
    f.t.scoring.tiebreakers = ["difference"];
    expect(f.order().slice(0, 2)).toEqual(["A", "B"]);
    f.s.tiebreakers = ["conceded"];
    expect(f.order().slice(0, 2)).toEqual(["B", "A"]);
  });
});
