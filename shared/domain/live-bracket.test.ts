import { describe, expect, it } from "vitest";
import { createTournament, team, tournamentSchema } from "./model";
import { fixtures, newStage, resolve } from "./tournament";

describe("chaveamento provisório", () => {
  function setup(kind: "group" | "knockout" = "group") {
    const t = createTournament("Copa", "handball");
    t.teams = [team("Azul"), team("Verde")];
    const source = newStage("Origem", kind, t.teams.map(x => x.id));
    const target = newStage("Final", "knockout", [null, null]);
    t.stages = [source, target];
    const matches = fixtures(t, source);
    source.matchIds = matches.map(m => m.id);
    t.links = [{ id: "link", source: source.id, target: target.id, slot: 0, output: kind === "knockout" ? "winner" : "rank-1" }];
    return { t, source, target, matches };
  }
  it("preserva a configuração e aceita campeonatos antigos", () => {
    const { t } = setup();
    expect(tournamentSchema.parse(t).overlay.liveBracket).toBeUndefined();
    t.overlay.liveBracket = true;
    expect(tournamentSchema.parse(t).overlay.liveBracket).toBe(true);
  });
  it("projeta a liderança sem mudar a classificação oficial ou os dados", () => {
    const { t, target, matches } = setup();
    matches[0].status = "live";
    matches[0].b.score = 8;
    const before = JSON.stringify({ t, matches });
    expect(resolve(t, matches)[target.id].slots[0]).toBeNull();
    expect(resolve(t, matches, true)[target.id].slots[0]).toBe(t.teams[1].id);
    expect(JSON.stringify({ t, matches })).toBe(before);
    matches[0].a.score = 10;
    expect(resolve(t, matches, true)[target.id].slots[0]).toBe(t.teams[0].id);
  });
  it("não inventa classificados antes de jogar nem vencedores de empate ao vivo", () => {
    const { t, target, matches } = setup("knockout");
    expect(resolve(t, matches, true)[target.id].slots[0]).toBeNull();
    matches[0].status = "live";
    expect(resolve(t, matches, true)[target.id].slots[0]).toBeNull();
    matches[0].a.score = 3;
    expect(resolve(t, matches, true)[target.id].slots[0]).toBe(t.teams[0].id);
    matches[0].status = "done";
    expect(resolve(t, matches, true)).toEqual(resolve(t, matches));
  });
});
