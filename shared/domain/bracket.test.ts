import { describe, expect, it } from "vitest";
import { createTournament, team, type Match } from "./model";
import { newStage, fixtures } from "./tournament";
import { bracketLayout, bracketPages, inGroup } from "./bracket";

function fixture(count = 4) {
  const t = createTournament("Copa", "handball");
  t.teams = [team("Azul"), team("Verde")];
  t.groups = [
    { id: "q", name: "Quartas de Final", parentId: null },
    { id: "s", name: "Semifinais", parentId: null },
  ];
  const matches: Match[] = [];
  for (let i = 0; i < count; i++) {
    const stage = newStage(
      `Quartas de Final ${i + 1}`,
      "knockout",
      t.teams.map((t) => t.id),
    );
    stage.groupId = "q";
    const ms = fixtures(t, stage);
    stage.matchIds = ms.map((m) => m.id);
    t.stages.push(stage);
    matches.push(...ms);
  }
  return { t, matches };
}
describe("conjuntos na overlay de bracket", () => {
  it.each(["handball", "volleyball", "football"] as const)(
    "separa conjuntos com nomes livres em novos campeonatos de %s",
    (sport) => {
      const t = createTournament("Nova competição", sport);
      t.teams = [team("Azul"), team("Verde")];
      t.groups = [
        { id: "a", name: "Categoria especial", parentId: null },
        { id: "b", name: "Caminho alternativo", parentId: null },
      ];
      const matches: Match[] = [];
      for (const group of t.groups) {
        const s = newStage(
          "Decisão",
          "knockout",
          t.teams.map((x) => x.id),
        );
        s.groupId = group.id;
        const ms = fixtures(t, s);
        s.matchIds = ms.map((m) => m.id);
        t.stages.push(s);
        matches.push(...ms);
      }
      const pages = bracketPages(t, t.stages, matches);
      expect(pages).toHaveLength(2);
      expect(pages.map((p) => p.columns[0].title)).toEqual(
        t.groups.map((g) => g.name),
      );
      expect(pages.map((p) => p.columns[0].matchIds)).toEqual(
        t.stages.map((s) => s.matchIds),
      );
    },
  );
  it("mantém toda a Série Ouro junta e as repescagens em outra página", () => {
    const { t, matches } = fixture(4);
    t.groups[0].name = "Série Ouro";
    const quarters = [...t.stages];
    const add = (name: string, groupId = "q") => {
      const s = newStage(name, "knockout", [null, null]);
      s.groupId = groupId;
      const ms = fixtures(t, s);
      s.matchIds = ms.map((m) => m.id);
      t.stages.push(s);
      matches.push(...ms);
      return s;
    };
    const semis = [add("Semifinal Ouro 01"), add("Semifinal Ouro 02")];
    const final = add("Final Ouro");
    const feeders = [add("Repescagem 01", "s"), add("Repescagem 02", "s")];
    const connect = (source: string, target: string, slot: number) =>
      t.links.push({
        id: `${source}-${target}`,
        source,
        target,
        slot,
        output: "winner",
      });
    quarters.forEach((s, i) =>
      connect(s.id, semis[Math.floor(i / 2)].id, i % 2),
    );
    semis.forEach((s, i) => connect(s.id, final.id, i));
    feeders.forEach((s, i) => connect(s.id, quarters[i].id, 1));
    for (const selection of [
      t.stages.filter((s) => s.groupId === "q"),
      t.stages,
    ]) {
      const pages = bracketPages(t, selection, matches);
      expect(pages).toHaveLength(2);
      expect(pages[0].columns.map((c) => c.matchIds.length)).toEqual([4, 2, 1]);
      expect(pages[1].columns).toHaveLength(1);
      expect(pages[1].columns[0].matchIds.sort()).toEqual(
        feeders.flatMap((s) => s.matchIds).sort(),
      );
      expect(bracketLayout(t, pages[0].columns).edges).toHaveLength(6);
      expect(
        pages.flatMap((p) => p.columns.flatMap((c) => c.matchIds)).sort(),
      ).toEqual(matches.map((m) => m.id).sort());
      expect(t.stages).toHaveLength(9);
    }
  });
  it("mantém a próxima rodada visível nas páginas de uma rodada maior", () => {
    const { t, matches } = fixture(8);
    const semi = newStage("Semifinal", "knockout", [null, null]);
    semi.groupId = "q";
    const ms = fixtures(t, semi);
    semi.matchIds = ms.map((m) => m.id);
    t.links = [
      {
        id: "l",
        source: t.stages[7].id,
        target: semi.id,
        output: "winner",
        slot: 0,
      },
    ];
    t.stages.push(semi);
    const pages = bracketPages(t, t.stages, [...matches, ...ms]);
    expect(pages).toHaveLength(2);
    expect(
      pages.every((p) => p.columns.some((c) => c.matchIds.includes(ms[0].id))),
    ).toBe(true);
    expect(bracketLayout(t, pages[1].columns).edges).toHaveLength(1);
  });
  it("centraliza a próxima fase entre os confrontos de origem e distingue perdedores", () => {
    const { t, matches } = fixture(2);
    const semi = newStage("Semifinal", "knockout", [null, null]);
    semi.groupId = "q";
    const ms = fixtures(t, semi);
    semi.matchIds = ms.map((m) => m.id);
    t.links = t.stages.map((s, i) => ({
      id: `l${i}`,
      source: s.id,
      target: semi.id,
      output: i ? "loser" : "winner",
      slot: i,
    }));
    t.stages.push(semi);
    const page = bracketPages(t, t.stages, [...matches, ...ms])[0];
    const layout = bracketLayout(t, page.columns);
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges.map((e) => e.loser)).toEqual([false, true]);
    expect(layout.nodes[2].y).toBe((layout.nodes[0].y + layout.nodes[1].y) / 2);
    expect(layout.nodes[2].x).toBeGreaterThan(layout.nodes[0].x);
    expect(
      layout.nodes.every(
        (n) => n.y >= 54 && n.y + layout.cardHeight <= layout.height,
      ),
    ).toBe(true);
    expect(bracketLayout(t, [page.columns[1]]).edges).toEqual([]);
  });
  it("ignora grupos, ligas e suíço mesmo dentro de um conjunto com eliminatórias", () => {
    const { t, matches } = fixture(1);
    const knockoutIds = [...matches.map((m) => m.id)];
    for (const kind of ["group", "league", "swiss"] as const) {
      const stage = newStage(
        kind,
        kind,
        t.teams.map((t) => t.id),
      );
      stage.groupId = "q";
      const ms = fixtures(t, stage);
      stage.matchIds = ms.map((m) => m.id);
      t.stages.push(stage);
      matches.push(...ms);
    }
    expect(
      bracketPages(t, t.stages, matches).flatMap((p) =>
        p.columns.flatMap((c) => c.matchIds),
      ),
    ).toEqual(knockoutIds);
    expect(
      bracketPages(
        t,
        t.stages.filter((s) => s.kind !== "knockout"),
        matches,
      ),
    ).toEqual([]);
  });
  it("reúne fases personalizadas em uma coluna e ordena a etapa seguinte pelas conexões", () => {
    const { t, matches } = fixture();
    const semi = newStage("Semifinal 1", "knockout", [null, null]);
    semi.groupId = "q";
    const ms = fixtures(t, semi);
    semi.matchIds = ms.map((m) => m.id);
    t.stages.unshift(semi);
    t.links = [
      {
        id: "link",
        source: t.stages[1].id,
        target: semi.id,
        output: "winner",
        slot: 0,
      },
    ];
    const pages = bracketPages(t, t.stages, [...matches, ...ms]);
    expect(pages).toHaveLength(1);
    expect(pages[0].columns.map((c) => c.title)).toEqual([
      "Quartas de Final",
      "Semifinal",
    ]);
    expect(pages[0].columns[0].matchIds).toHaveLength(4);
    expect(pages[0].columns[1].matchIds).toEqual(semi.matchIds);
  });
  it("pagina sem perder jogos nem misturar categorias", () => {
    const { t, matches } = fixture(12);
    t.stages[11].category = "Juvenil";
    const pages = bracketPages(t, t.stages, matches);
    expect(pages).toHaveLength(4);
    expect(
      pages.every((p) => p.columns.every((c) => c.matchIds.length <= 5)),
    ).toBe(true);
    expect(
      pages.flatMap((p) => p.columns.flatMap((c) => c.matchIds)).sort(),
    ).toEqual(matches.map((m) => m.id).sort());
    expect(pages[3].category).toBe("Juvenil");
  });
  it("seleciona descendentes e não inclui conjuntos alheios", () => {
    const { t } = fixture();
    t.groups.push({ id: "root", name: "Chave principal", parentId: null });
    t.groups[0].parentId = "root";
    expect(inGroup(t, "q", ["root"])).toBe(true);
    expect(inGroup(t, "s", ["root"])).toBe(false);
    expect(inGroup(t, null, ["root"])).toBe(false);
  });
});
