import { describe, expect, it } from "vitest";
import { createMatch, matchSchema, type Match, type Side } from "./model";
import { applyCommand, tennisWinner } from "./scoring";
const point = (m: Match, side: Side) => applyCommand(m, { type: "score", side, amount: 1 }, 1000);
const game = (m: Match, side: Side) => {
  for (let i = 0; i < 4; i++) m = point(m, side);
  return m;
};
describe("tênis automático", () => {
  it.each(["a", "b"] as const)("identifica vitória de %s e retira ao reabrir ou reiniciar", side => {
    let m = createMatch("tennis");
    m.bestOf = 1;
    expect(tennisWinner(m)).toBeNull();
    for (let g = 0; g < 6; g++) m = game(m, side);
    expect(tennisWinner(m)).toBe(side);
    expect(tennisWinner({ ...m, status: "live" })).toBeNull();
    expect(tennisWinner(applyCommand(m, { type: "reset" }))).toBeNull();
    expect(tennisWinner({ ...createMatch("tennis"), status: "done" })).toBeNull();
  });
  it("distingue GAME de BREAK antes de alternar o saque, inclusive ao encerrar um set", () => {
    let m = game(createMatch("tennis"), "a");
    expect(m.tennisGame?.kind).toBe("hold");
    expect(m.tennisGame?.side).toBe("a");
    const first = m.tennisGame?.id;
    m = game(m, "a");
    expect(m.tennisGame?.kind).toBe("break");
    expect(m.tennisGame?.id).not.toBe(first);
    m.a.games = 5; m.b.games = 2; m.serve = "a";
    m = game(m, "a");
    expect(m.a.sets).toBe(1);
    expect(m.tennisGame?.kind).toBe("set");
    expect(matchSchema.parse(JSON.parse(JSON.stringify(m))).tennisGame).toEqual(m.tennisGame);
    expect(applyCommand(m, { type: "reset" }).tennisGame).toBeNull();
    expect(matchSchema.parse({ ...m, tennisGame: undefined }).tennisGame).toBeNull();
  });
  it("configura vantagem e no-ad em 40–40", () => {
    const m = createMatch("tennis");
    m.a.points = m.b.points = 3;
    expect(point(m, "a").a.points).toBe(4);
    m.hasAdvantage = false;
    expect(point(m, "a").a.games).toBe(1);
  });
  it.each([1, 3, 5] as const)("encerra melhor de %i na quantidade de sets correta", bestOf => {
    let m = createMatch("tennis");
    m.bestOf = bestOf;
    const target = Math.floor(bestOf / 2) + 1;
    for (let set = 1; set <= target; set++) {
      for (let g = 0; g < 6; g++) m = game(m, "a");
      expect(m.a.sets).toBe(set);
      expect(m.tennisGame?.kind).toBe("set");
      expect(m.status === "done").toBe(set === target);
      expect(tennisWinner(m)).toBe(set === target ? "a" : null);
    }
    expect(() => point(m, "a")).toThrow("encerrada");
    const reset = applyCommand(m, { type: "reset" });
    expect(reset.bestOf).toBe(bestOf);
    expect(reset.serveBreak).toBeNull();
  });
  it("entra em 6–6, alterna saque 1–2–2 e exige dois pontos de diferença", () => {
    let m = createMatch("tennis");
    m.a.games = 6; m.b.games = 5; m.serve = "b";
    m = game(m, "b");
    expect(m.tiebreak).toBe(true);
    expect(m.serve).toBe("a");
    const winners: Side[] = ["a", "b", "a", "b", "a", "b", "a", "b", "a", "b", "a", "b"];
    winners.forEach((side, i) => {
      m = point(m, side);
      expect(m.serve).toBe(Math.floor((i + 2) / 2) % 2 ? "b" : "a");
    });
    m = point(m, "a");
    expect(m.tiebreak).toBe(true);
    m = point(m, "b");
    m = point(point(m, "a"), "a");
    expect(m.setHistory).toEqual([{ a: 7, b: 6 }]);
    expect(m.serve).toBe("b");
    expect(m.tiebreak).toBe(false);
    expect(m.serveBreak).toBeNull();
    expect(m.tennisGame?.kind).toBe("set");
  });
  it.each([7, 8, 10])("saque do próximo set após tie-break terminado em %i pontos", winning => {
    let m = createMatch("tennis");
    m.a.games = m.b.games = 6;
    // Simulate a tie-break where B served first, including different final point parity.
    for (let i = 0; i < (winning === 7 ? 0 : winning - 2); i++) {
      if (i === 0) m.serve = "b";
      m = point(point(m, "a"), "b");
    }
    if (winning === 7) m.serve = "b";
    while (!m.a.sets) m = point(m, "a");
    expect(m.serve).toBe("a");
  });
  it("registra quebra somente quando o recebedor vence game, inclusive no fim do set", () => {
    let m = game(createMatch("tennis"), "a");
    expect(m.serveBreak).toBeNull();
    m = game(m, "a");
    expect(m.serveBreak?.side).toBe("a");
    expect(m.serveBreak?.at).toBe(1000);
    m.a.games = 5; m.b.games = 4; m.serve = "b";
    const old = m.serveBreak?.id;
    m = game(m, "a");
    expect(m.a.sets).toBe(1);
    expect(m.serveBreak?.id).not.toBe(old);
    expect(m.tennisGame?.kind).toBe("set");
    expect(m.tennisGame?.side).toBe("a");
    expect(matchSchema.parse(JSON.parse(JSON.stringify(m))).serveBreak).toEqual(m.serveBreak);
    expect(matchSchema.parse({ ...m, serveBreak: undefined }).serveBreak).toBeNull();
  });
});
