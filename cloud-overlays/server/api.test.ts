import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { createApi } from "./api";
import { SqliteRepository } from "./repository";
import { team, type Match, type Tournament } from "../src/domain/model";
import { generate, removeStages } from "../src/domain/tournament";
import { importCsv } from "../src/domain/csv";
describe("API SQLite", () => {
  let server: Server,
    app: ReturnType<typeof createApi>,
    repo: SqliteRepository,
    base: string,
    cookie: string;
  async function request(
    path: string,
    method = "GET",
    value?: unknown,
    authenticated = true,
  ) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(value ? { "Content-Type": "application/json" } : {}),
        ...(authenticated && cookie ? { Cookie: cookie } : {}),
      },
      body: value ? JSON.stringify(value) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie"),
    };
  }
  beforeEach(async () => {
    repo = new SqliteRepository(":memory:");
    app = createApi(repo);
    server = createServer((req, res) => {
      void app.handle(req, res);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/`;
    cookie = "";
    const setup = await request("setup", "POST", {
      username: "admin",
      password: "test-password",
      name: "Admin",
    });
    cookie = setup.cookie!.split(";")[0];
  });
  afterEach(async () => {
    app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  it("encerra o segundo tempo sem depender de uma tela de operação aberta", async () => {
    const m = (await request("matches", "POST", { sport: "handball" })).data as Match;
    m.period = "2º tempo"; m.status = "live"; m.a.score = 12;
    m.clock = { direction: "up", value: 1799, limit: 1800, startedAt: Date.now() - 1100 };
    m.playStartedAt = m.clock.startedAt;
    repo.put("match", m);
    await vi.waitFor(() => {
      const saved = repo.get<Match>("match", m.id)!;
      expect(saved.status).toBe("done");
      expect(saved.handballCue).toMatchObject({ kind: "victory", side: "a" });
      expect(saved.clock.startedAt).toBeNull();
      expect(saved.revision).toBe(m.revision + 1);
    }, { timeout: 1500 });
  });
  it("separa duas partidas da mesma modalidade e rejeita atualização obsoleta", async () => {
    const a = (await request("matches", "POST", { sport: "handball" }))
        .data as Match,
      b = (await request("matches", "POST", { sport: "handball" }))
        .data as Match;
    const command = { type: "score", side: "a", amount: 1 };
    expect(
      (await request(`matches/${a.id}`, "POST", { revision: 0, command }))
        .status,
    ).toBe(200);
    expect(
      (await request(`matches/${a.id}`, "POST", { revision: 0, command }))
        .status,
    ).toBe(409);
    expect((await request(`matches/${b.id}`)).data.a.score).toBe(0);
    expect((await request(`matches/${a.id}`)).data.a.score).toBe(1);
  });
  it("protege escrita e usuários, mas overlay pode ler partida sem sessão", async () => {
    const m = (await request("matches", "POST", { sport: "football" })).data;
    expect(
      (await request(`matches/${m.id}`, "GET", undefined, false)).status,
    ).toBe(200);
    expect(
      (
        await request(
          `matches/${m.id}`,
          "POST",
          { revision: 0, command: { type: "score", side: "a", amount: 1 } },
          false,
        )
      ).status,
    ).toBe(403);
    expect((await request("users", "GET", undefined, false)).status).toBe(403);
  });
  it("desfaz uma ação somente na partida selecionada", async () => {
    const m = (await request("matches", "POST", { sport: "tennis" })).data;
    await request(`matches/${m.id}`, "POST", {
      revision: 0,
      command: { type: "score", side: "a", amount: 1 },
    });
    const undo = await request(`matches/${m.id}/undo`, "POST", { revision: 1 });
    expect(undo.status).toBe(200);
    expect(undo.data.a.points).toBe(0);
    expect(undo.data.revision).toBe(2);
  });
  it("encerrar jogos avança final e corrigir vencedor limpa placar dependente", async () => {
    const t = (
      await request("tournaments", "POST", { sport: "handball", name: "Copa" })
    ).data as Tournament;
    t.teams = Array.from({ length: 4 }, (_, i) => team("Equipe " + i));
    const out = generate(t, "single", t.teams, "Principal");
    expect((await request(`tournaments/${t.id}`, "PUT", out)).status).toBe(200);
    const semifinals = out.matches.slice(0, 2),
      final = out.matches[2];
    async function score(mid: string, a: number, b: number) {
      const m = (await request(`matches/${mid}`)).data as Match;
      return request(`matches/${mid}`, "POST", {
        revision: m.revision,
        command: {
          type: "patch",
          patch: {
            a: { ...m.a, score: a },
            b: { ...m.b, score: b },
            status: "done",
          },
        },
      });
    }
    await score(semifinals[0].id, 2, 1);
    await score(semifinals[1].id, 4, 1);
    expect((await score(final.id, 8, 4)).status).toBe(200);
    await score(semifinals[0].id, 1, 2);
    const fm = (await request(`matches/${final.id}`)).data;
    expect(fm.status).toBe("scheduled");
    expect(fm.a.score).toBe(0);
    expect(fm.a.team.id).toBe(semifinals[0].b.team.id);
  });
  it("transação inválida não deixa partidas órfãs", async () => {
    const t = (
      await request("tournaments", "POST", { sport: "futsal", name: "Copa" })
    ).data as Tournament;
    t.teams = [team("A"), team("B")];
    const out = generate(t, "league", t.teams, "Principal");
    out.tournament.stages[0].seeds[1] = out.tournament.stages[0].seeds[0];
    expect((await request(`tournaments/${t.id}`, "PUT", out)).status).toBe(400);
    expect((await request("matches")).data).toHaveLength(0);
    expect((await request(`tournaments/${t.id}`)).data.teams).toHaveLength(0);
  });
  it("preserva uniformes por partida do campeonato e limita textos a preto e branco", async () => {
    const t = (
      await request("tournaments", "POST", {
        sport: "futsal",
        name: "Uniformes",
      })
    ).data as Tournament;
    t.teams = [team("Azul"), team("Laranja")];
    const out = generate(t, "return", t.teams, "Principal");
    expect((await request(`tournaments/${t.id}`, "PUT", out)).status).toBe(200);
    const m = (await request(`matches/${out.matches[0].id}`)).data as Match;
    const other = (await request(`matches/${out.matches[1].id}`)).data as Match;
    const changed = await request(`matches/${m.id}`, "POST", {
      revision: m.revision,
      command: {
        type: "patch",
        patch: {
          teamA: { ...m.a.team, color: "#ffff00", textColor: "#000000" },
          teamB: { ...m.b.team, color: "#0000ff", textColor: "#FFFFFF" },
        },
      },
    });
    expect(changed.status).toBe(200);
    expect(changed.data.a.team.color).toBe("#ffff00");
    expect(changed.data.b.team.textColor).toBe("#ffffff");
    const scored = await request(`matches/${m.id}`, "POST", {
      revision: changed.data.revision,
      command: { type: "score", side: "a", amount: 1 },
    });
    expect(scored.data.a.team.color).toBe("#ffff00");
    expect(scored.data.a.team.textColor).toBe("#000000");
    expect((await request(`matches/${other.id}`)).data.a.team).toEqual(
      other.a.team,
    );
    expect((await request(`tournaments/${t.id}`)).data.teams).toEqual(t.teams);
    const legacy = await request(`matches/${m.id}`, "POST", {
      revision: scored.data.revision,
      command: {
        type: "patch",
        patch: { teamA: { ...scored.data.a.team, textColor: "#ff0000" } },
      },
    });
    expect(legacy.status).toBe(200);
    expect(legacy.data.a.team.textColor).toBe("#000000");
  });
  it("exclui fases e partidas permanentemente, remove conexões e recusa snapshots antigos", async () => {
    const t = (
      await request("tournaments", "POST", {
        sport: "handball",
        name: "Exclusão",
      })
    ).data as Tournament;
    t.teams = Array.from({ length: 4 }, (_, i) => team(`Equipe ${i}`));
    const generated = generate(t, "single", t.teams, "Principal");
    const saved = (await request(`tournaments/${t.id}`, "PUT", generated))
      .data as Tournament;
    const removed = saved.stages[0];
    const deletion = await request(`tournaments/${t.id}`, "PUT", {
      tournament: removeStages(saved, [removed.id]),
    });
    expect(deletion.status).toBe(200);
    const reloaded = (await request(`tournaments/${t.id}`)).data as Tournament;
    expect(reloaded.stages.some((s) => s.id === removed.id)).toBe(false);
    expect(
      reloaded.links.some(
        (l) => l.source === removed.id || l.target === removed.id,
      ),
    ).toBe(false);
    for (const mid of removed.matchIds)
      expect((await request(`matches/${mid}`)).status).toBe(404);
    expect(
      (await request(`tournaments/${t.id}`, "PUT", { tournament: saved }))
        .status,
    ).toBe(409);
    expect((await request(`tournaments/${t.id}`)).data.stages).toEqual(
      reloaded.stages,
    );
  });
  it("persiste CSV com vagas pendentes e permite definir os participantes depois", async () => {
    const t = (
      await request("tournaments", "POST", { sport: "handball", name: "Vagas" })
    ).data as Tournament;
    const out = importCsv(
      "Fase;Time A;Time B\nFinal;A Definir;A Definir",
      t,
      [],
    );
    const saved = await request(`tournaments/${t.id}`, "PUT", out);
    expect(saved.status).toBe(200);
    const m = (await request(`matches/${out.matches[0].id}`)).data as Match;
    expect(m.a.team.id).not.toBe(m.b.team.id);
    expect(m.a.team.name).toBe("A definir");
    expect(saved.data.teams).toEqual([]);
    const updated = saved.data as Tournament;
    updated.teams = [team("Azul"), team("Verde")];
    updated.stages[0].seeds = updated.teams.map((t) => t.id);
    expect(
      (await request(`tournaments/${t.id}`, "PUT", { tournament: updated }))
        .status,
    ).toBe(200);
    const defined = (await request(`matches/${m.id}`)).data as Match;
    expect(defined.a.team.name).toBe("Azul");
    expect(defined.b.team.name).toBe("Verde");
  });
  it("importar resultados de semifinais atualiza os jogos e avança a final sem duplicar fases", async () => {
    const t = (
      await request("tournaments", "POST", {
        sport: "handball",
        name: "Resultados CSV",
      })
    ).data as Tournament;
    t.teams = Array.from({ length: 4 }, (_, i) => team(`Equipe ${i}`));
    const generated = generate(t, "single", t.teams, "Principal");
    const saved = (await request(`tournaments/${t.id}`, "PUT", generated))
      .data as Tournament;
    const games = (await request(`matches?tournament=${t.id}`)).data as Match[];
    const semis = generated.matches
      .slice(0, 2)
      .map((m) => games.find((g) => g.id === m.id)!);
    const csv =
      "ID Partida;Categoria;Fase;Time A;Time B;Placar A;Placar B;Status\n" +
      semis
        .map(
          (m) =>
            `${m.id};${m.category};${saved.stages.find((s) => s.id === m.stageId)!.name};${m.a.team.name};${m.b.team.name};25;20;Agendada`,
        )
        .join("\n");
    const imported = importCsv(csv, saved, games);
    expect(imported.matches).toHaveLength(0);
    expect(imported.updates).toHaveLength(2);
    const response = await request(`tournaments/${t.id}`, "PUT", imported);
    expect(response.status).toBe(200);
    const final = (await request(`matches/${generated.matches[2].id}`))
      .data as Match;
    expect(final.a.team.id).toBe(semis[0].a.team.id);
    expect(final.b.team.id).toBe(semis[1].a.team.id);
    expect((await request(`matches?tournament=${t.id}`)).data).toHaveLength(3);
    expect((await request(`tournaments/${t.id}`, "PUT", imported)).status).toBe(
      409,
    );
  });
  it("desconecta a saída e libera a entrada, limpando o participante dependente", async () => {
    const t = (
      await request("tournaments", "POST", {
        sport: "handball",
        name: "Conexões",
      })
    ).data as Tournament;
    t.teams = Array.from({ length: 4 }, (_, i) => team(`Equipe ${i}`));
    const out = generate(t, "single", t.teams, "Principal");
    await request(`tournaments/${t.id}`, "PUT", out);
    const m = (await request(`matches/${out.matches[0].id}`)).data as Match;
    await request(`matches/${m.id}`, "POST", {
      revision: m.revision,
      command: {
        type: "patch",
        patch: { a: { ...m.a, score: 2 }, status: "done" },
      },
    });
    const current = (await request(`tournaments/${t.id}`)).data as Tournament;
    const link = current.links.find((l) => l.source === m.stageId)!;
    current.links = current.links.filter((l) => l.id !== link.id);
    const removed = await request(`tournaments/${t.id}`, "PUT", {
      tournament: current,
    });
    expect(removed.status).toBe(200);
    expect(
      removed.data.links.some((l: { id: string }) => l.id === link.id),
    ).toBe(false);
    const final = (await request(`matches/${out.matches[2].id}`)).data as Match;
    expect(final.a.team.id).toMatch(/^pending-/);
    expect(final.status).toBe("scheduled");
  });
  it("backup rejeita duplicatas sem sobrescrever dados", async () => {
    const m = (await request("matches", "POST", { sport: "volleyball" })).data;
    const backup = (await request("backup")).data;
    expect((await request("backup", "POST", backup)).status).toBe(409);
    expect((await request(`matches/${m.id}`)).data.id).toBe(m.id);
  });
});
