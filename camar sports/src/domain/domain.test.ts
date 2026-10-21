import { describe, expect, it } from "vitest";
import {
  createMatch,
  createTournament,
  matchSchema,
  sports,
  team,
  type Match,
  type Sport,
} from "./model";
import { applyCommand, clockValue, playingTime, result } from "./scoring";
import {
  fixtures,
  generate,
  newStage,
  resolve,
  validateTournament,
  type Format,
} from "./tournament";
import { exportCsv, importCsv } from "./csv";

describe("partidas independentes e cronômetros", () => {
  it.each(Object.keys(sports))(
    "cria %s com schema válido e IDs próprios",
    (sport) => {
      const m = createMatch(sport as Sport),
        other = createMatch(sport as Sport);
      expect(matchSchema.safeParse(m).success).toBe(true);
      expect(m.id).not.toBe(other.id);
      const next = applyCommand(m, { type: "score", side: "a", amount: 1 });
      expect(other.a.score).toBe(0);
      expect(m.a.score).toBe(0);
      expect(next).not.toBe(m);
    },
  );
  it("pausa e retoma sem acumular o tempo fora de jogo", () => {
    let m = createMatch("handball");
    m = applyCommand(m, { type: "clock", action: "start" }, 1000);
    expect(clockValue(m.clock, 11000)).toBe(10);
    m = applyCommand(m, { type: "clock", action: "pause" }, 11000);
    expect(clockValue(m.clock, 50000)).toBe(10);
    m = applyCommand(m, { type: "clock", action: "start" }, 50000);
    expect(clockValue(m.clock, 55000)).toBe(15);
    expect(playingTime(m, 55000)).toBe(15);
  });
  it("exclusões acompanham tempo jogado, inclusive depois de resetar o período", () => {
    let m = createMatch("handball");
    m = applyCommand(m, { type: "clock", action: "start" }, 1000);
    m = applyCommand(m, { type: "penalty", side: "a", player: "12" }, 61000);
    expect(m.a.penalties[0].expiresAtPlay).toBe(180);
    m = applyCommand(m, { type: "clock", action: "reset" }, 91000);
    expect(playingTime(m, 200000)).toBe(90);
    m = applyCommand(m, { type: "clock", action: "start" }, 200000);
    expect(playingTime(m, 290000)).toBe(180);
  });
  it("tempo técnico pausa ambos os relógios e consome uma solicitação", () => {
    let m = createMatch("basketball");
    m = applyCommand(m, { type: "clock", action: "start" }, 1000);
    m = applyCommand(m, { type: "timeout", side: "a" }, 6000);
    expect(m.clock.startedAt).toBeNull();
    expect(m.shotClock.value).toBe(25);
    expect(m.a.timeouts).toEqual([true, false, false]);
  });
  it("cronômetros saturam no limite e pontuação nunca fica negativa", () => {
    let m = createMatch("futsal");
    m = applyCommand(m, { type: "clock", action: "start" }, 1000);
    expect(clockValue(m.clock, 5000000)).toBe(0);
    expect(playingTime(m, 5000000)).toBe(1200);
    m = applyCommand(m, { type: "score", side: "a", amount: -1 });
    expect(m.a.score).toBe(0);
  });
  it("editar identidade da equipe preserva a pontuação atual", () => {
    const m = createMatch("football");
    m.a.score = 3;
    const n = applyCommand(m, {
      type: "patch",
      patch: { teamA: { ...m.a.team, shortName: "NOVO" } },
    });
    expect(n.a.score).toBe(3);
    expect(n.a.team.shortName).toBe("NOVO");
  });
});
describe("regras das modalidades", () => {
  const point = (m: Match, side: "a" | "b") =>
    applyCommand(m, { type: "score", side, amount: 1 });
  it("tênis: deuce, vantagem, volta ao deuce e game", () => {
    let m = createMatch("tennis");
    m.a.points = m.b.points = 3;
    m = point(m, "a");
    expect(m.a.points).toBe(4);
    m = point(m, "b");
    expect([m.a.points, m.b.points]).toEqual([3, 3]);
    m = point(point(m, "a"), "a");
    expect(m.a.games).toBe(1);
    expect([m.a.points, m.b.points]).toEqual([0, 0]);
  });
  it("beach tennis: ponto decisivo sem vantagem", () => {
    const m = createMatch("beachtennis");
    m.a.points = m.b.points = 3;
    expect(point(m, "b").b.games).toBe(1);
  });
  it("tênis: set a 6–4 e tie-break a 6–6", () => {
    let m = createMatch("tennis");
    m.a.games = 5;
    m.b.games = 4;
    m.a.points = 3;
    m = point(m, "a");
    expect(m.a.sets).toBe(1);
    expect(m.setHistory).toEqual([{ a: 6, b: 4 }]);
    m.a.games = 5;
    m.b.games = 6;
    m.a.points = 3;
    m = point(m, "a");
    expect(m.tiebreak).toBe(true);
    m.a.points = 6;
    m.b.points = 5;
    m = point(m, "a");
    expect(m.a.sets).toBe(2);
    expect(m.setHistory[1]).toEqual({ a: 7, b: 6 });
  });
  it("vôlei registra set sem apagar resultado anterior e mantém diferença de placar/sets", () => {
    let m = createMatch("volleyball");
    m.a.score = 25;
    m.b.score = 23;
    m = applyCommand(m, { type: "finishSet", side: "a" });
    expect(result(m, "a")).toBe(1);
    expect(m.a.score).toBe(0);
    expect(m.setHistory).toEqual([{ a: 25, b: 23 }]);
  });
  it("shootout alterna a cobrança e acrescenta rodadas extras aos dois lados", () => {
    let m = createMatch("football");
    m = applyCommand(m, { type: "shootout", side: "b", index: 0 });
    expect(m.b.shootout[0]).toBe("goal");
    m = applyCommand(m, { type: "shootout", side: "b", index: 0 });
    expect(m.b.shootout[0]).toBe("miss");
    m = applyCommand(m, { type: "extraShootout" });
    expect(m.a.shootout.length).toBe(6);
    expect(m.b.shootout.length).toBe(6);
  });
});
describe("campeonatos", () => {
  const tournament = (size = 4) => {
    const t = createTournament("Teste", "handball");
    t.teams = Array.from({ length: size }, (_, i) =>
      team(`Equipe ${i + 1}`, i),
    );
    return t;
  };
  it.each([
    "groups",
    "league",
    "return",
    "single",
    "double",
    "ladder",
    "swiss",
  ])("gera formato %s válido", (format) => {
    const t = tournament(8),
      out = generate(t, format as Format, t.teams, "Principal");
    expect(() => validateTournament(out.tournament, out.matches)).not.toThrow();
    expect(new Set(out.matches.map((m) => m.id)).size).toBe(out.matches.length);
  });
  it("liga ida e volta gera 12 partidas para 4 equipes", () => {
    const t = tournament(),
      out = generate(t, "return", t.teams, "Principal");
    expect(out.matches.length).toBe(12);
  });
  it.each(["seeded", "random", "sequential"] as const)(
    "byes com 5 equipes não criam confronto vazio: %s",
    (pairing) => {
      const t = tournament(5),
        out = generate(t, "single", t.teams, "Principal", pairing),
        resolved = resolve(out.tournament, out.matches);
      expect(
        out.tournament.stages.slice(0, 4).every((s) => s.seeds.some(Boolean)),
      ).toBe(true);
      expect(Object.values(resolved).filter((r) => r.complete).length).toBe(3);
    },
  );
  it("avança somente depois de encerramento e requer vencedor em empate eliminatório", () => {
    const t = tournament(),
      out = generate(t, "single", t.teams, "Principal");
    const [s1, s2, final] = out.tournament.stages;
    let r = resolve(out.tournament, out.matches);
    expect(r[final.id].slots).toEqual([null, null]);
    for (const m of out.matches.filter((m) => m.stageId !== final.id)) {
      m.a.score = 3;
      m.b.score = 1;
      m.status = "done";
    }
    r = resolve(out.tournament, out.matches);
    expect(r[final.id].slots).toEqual([s1.seeds[0], s2.seeds[0]]);
    const fm = out.matches.find((m) => m.stageId === final.id)!;
    fm.status = "done";
    expect(resolve(out.tournament, out.matches)[final.id].complete).toBe(false);
    fm.tiebreakWinner = "b";
    expect(resolve(out.tournament, out.matches)[final.id].outputs.winner).toBe(
      s2.seeds[0],
    );
  });
  it("impede ciclos e duas conexões na mesma entrada", () => {
    const t = tournament(),
      a = newStage("A", "knockout", [null, null]),
      b = newStage("B", "knockout", [null, null]);
    t.stages = [a, b];
    t.links = [
      { id: "1", source: a.id, target: b.id, output: "winner", slot: 0 },
      { id: "2", source: b.id, target: a.id, output: "winner", slot: 0 },
    ];
    expect(() => resolve(t, [])).toThrow("ciclos");
  });
  it("classificação considera somente partidas encerradas", () => {
    const t = tournament(),
      s = newStage(
        "Liga",
        "league",
        t.teams.map((t) => t.id),
      );
    t.stages = [s];
    const ms = fixtures(t, s);
    s.matchIds = ms.map((m) => m.id);
    ms[0].a.score = 8;
    ms[0].status = "live";
    expect(resolve(t, ms)[s.id].standings.every((r) => r.points === 0)).toBe(
      true,
    );
    ms[0].status = "done";
    const row = resolve(t, ms)[s.id].standings[0];
    expect(row.teamId).toBe(t.teams[0].id);
    expect(row.points).toBe(2);
    expect(row.difference).toBe(8);
  });
  it("importa CSV legado com equipes e jogos, preserva zeros e evita duplicatas", () => {
    const t = tournament();
    const csv =
      "Tipo;Categoria;Fase;Time A Oficial;Placar A;Time B Oficial;Placar B;Status\nEquipe;Principal;;Azul;;;;\nPartida;Principal;Grupo A;Azul;0;Verde;0;Encerrado";
    const out = importCsv(csv, t, []);
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0].status).toBe("done");
    expect(out.matches[0].a.score).toBe(0);
    expect(importCsv(csv, out.tournament, out.matches).matches).toHaveLength(0);
    expect(
      importCsv(exportCsv(out.tournament, out.matches), t, []).matches,
    ).toHaveLength(1);
  });
});
