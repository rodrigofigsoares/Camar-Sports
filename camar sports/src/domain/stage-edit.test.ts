import { describe, expect, it } from "vitest";
import { createTournament } from "./model";
import { importCsv, exportCsv } from "./csv";
import { editStage, newStage, resolve } from "./tournament";

describe("edição de fases importadas", () => {
  it("converte grupo em eliminatória preservando jogos e converte suas conexões", () => {
    const base = createTournament("Copa", "handball");
    const { tournament: t, matches } = importCsv(
      "Fase;Time A;Time B;Placar A;Placar B\nSemi;Azul;Verde;25;20",
      base,
      [],
    );
    const semi = t.stages[0];
    const final = newStage("Final", "knockout", [null, null]);
    t.stages.push(final);
    t.links.push({
      id: "link",
      source: semi.id,
      target: final.id,
      output: "rank-1",
      slot: 0,
    });
    const updated = editStage(t, { ...semi, kind: "knockout" });
    expect(updated.stages[0].matchIds).toEqual(semi.matchIds);
    expect(updated.links[0].output).toBe("winner");
    expect(resolve(updated, matches)[final.id].slots[0]).toBe(
      matches[0].a.team.id,
    );
    const reversed = editStage(updated, {
      ...updated.stages[0],
      kind: "league",
    });
    expect(reversed.links[0].output).toBe("rank-1");
    expect(matches[0].a.score).toBe(25);
  });
  it("impede converter uma fase com vários confrontos em um único confronto", () => {
    const { tournament: t } = importCsv(
      "Fase;Time A;Time B\nQuartas;Azul;Verde\nQuartas;Amarelo;Roxo",
      createTournament("Copa", "handball"),
      [],
    );
    expect(() => editStage(t, { ...t.stages[0], kind: "knockout" })).toThrow(
      /vários jogos/,
    );
    expect(t.stages[0].kind).toBe("group");
  });
  it("respeita o formato declarado no CSV e preserva-o na exportação", () => {
    const base = createTournament("Copa", "handball");
    const out = importCsv(
      "Fase;Tipo de fase;Time A;Time B\nFinal;Eliminatória;Azul;Verde",
      base,
      [],
    );
    expect(out.tournament.stages[0].kind).toBe("knockout");
    expect(
      importCsv(exportCsv(out.tournament, out.matches), base, []).tournament
        .stages[0].kind,
    ).toBe("knockout");
  });
});
