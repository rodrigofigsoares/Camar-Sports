import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { createTournament, sports, type Sport } from "./model";
import { csvTemplate, exportCsv, importCsv } from "./csv";
import { validateTournament } from "./tournament";

describe("modelo e importação CSV por esporte", () => {
  it("importa vagas A Definir independentes sem criar equipes fictícias ou perder jogos", () => {
    const t = createTournament("Copa", "handball");
    const csv =
      "Fase;Time A;Time B\nSemifinais;A Definir;A Definir\nSemifinais; a definir ;A DEFINIR\nFinal;Azul;A Definir";
    const out = importCsv(csv, t, []);
    expect(out.matches).toHaveLength(3);
    expect(out.tournament.teams.map((t) => t.name)).toEqual(["Azul"]);
    expect(out.tournament.stages[0].seeds).toEqual([null, null, null, null]);
    expect(
      new Set(
        out.matches.slice(0, 2).flatMap((m) => [m.a.team.id, m.b.team.id]),
      ).size,
    ).toBe(4);
    expect(() => validateTournament(out.tournament, out.matches)).not.toThrow();
    expect(importCsv(csv, out.tournament, out.matches).matches).toHaveLength(0);
    const exported = exportCsv(out.tournament, out.matches);
    expect(importCsv(exported, t, []).matches).toHaveLength(3);
    expect(
      importCsv(exported, out.tournament, out.matches).matches,
    ).toHaveLength(0);
  });
  it("mantém a validação de equipe real repetida e impede resultados sem participantes definidos", () => {
    const t = createTournament("Copa", "handball");
    expect(() => importCsv("Time A;Time B\nAzul;Azul", t, [])).toThrow(
      /si mesma/,
    );
    expect(() =>
      importCsv(
        "Time A;Time B;Status;Placar A;Placar B\nA Definir;Azul;Encerrado;0;0",
        t,
        [],
      ),
    ).toThrow(/agendada e sem resultado/);
  });
  it.each(Object.keys(sports) as Sport[])(
    "%s reconhece seu modelo vazio e reimporta a própria exportação",
    (sport) => {
      const t = createTournament("Copa", sport);
      expect(importCsv(csvTemplate(t), t, []).matches).toEqual([]);
      expect(importCsv(exportCsv(t, []), t, []).matches).toEqual([]);
      const fields = Papa.parse<string[]>(csvTemplate(t)).data[0];
      const row = {
        "Time A Oficial": "Equipe; Azul",
        "Time B Oficial": "São José",
        "Placar A": 2,
        "Placar B": 0,
        Data: "2026-09-20",
        Horário: "15:30",
        Status: "Encerrado",
        ...(fields.includes("Set 1 A")
          ? { "Set 1 A": 25, "Set 1 B": 20, "Set 2 A": 25, "Set 2 B": 21 }
          : {}),
      };
      const input = Papa.unparse({ fields, data: [row] }, { delimiter: ";" });
      const first = importCsv(input, t, []);
      const exported = exportCsv(first.tournament, first.matches);
      const second = importCsv(exported, t, []);
      expect(second.matches).toHaveLength(1);
      expect(second.matches[0].a.team.name).toBe("Equipe; Azul");
      expect(second.matches[0].scheduledAt).toBe("2026-09-20T15:30");
      expect(second.matches[0].status).toBe("done");
      expect(second.matches[0].setHistory).toEqual(first.matches[0].setHistory);
      expect(second.matches[0].a.score).toBe(first.matches[0].a.score);
      expect(second.matches[0].a.sets).toBe(first.matches[0].a.sets);
      expect(
        importCsv(exported, first.tournament, first.matches).matches,
      ).toHaveLength(0);
    },
  );
  it("handebol não exige nem exporta sets; placares e agenda são opcionais", () => {
    const t = createTournament("Copa", "handball");
    expect(csvTemplate(t)).not.toMatch(/Set \d/);
    const out = importCsv("Equipe A;Equipe B\nAzul;Verde", t, []);
    expect(out.matches[0].status).toBe("scheduled");
    expect(exportCsv(out.tournament, out.matches)).not.toMatch(/Set \d/);
  });
  it.each([";", ",", "\t"])(
    "aceita delimitador %s e cabeçalhos com espaços/acentos",
    (delimiter) => {
      const t = createTournament("Copa", "handball");
      const text = Papa.unparse(
        [
          {
            " Time A Oficial ": "São José",
            "Time B Oficial": "Campinas",
            "Gols A": 0,
            "Gols B": 0,
            Status: "Encerrado",
          },
        ],
        { delimiter },
      );
      expect(importCsv("\uFEFF" + text, t, []).matches[0].a.score).toBe(0);
    },
  );
  it("aceita diretiva de separador do Excel", () => {
    const t = createTournament("Copa", "handball");
    expect(
      importCsv("\uFEFFsep=;\r\nTime A;Time B\r\nAzul;Verde", t, []).matches,
    ).toHaveLength(1);
  });
  it("explica linhas incompletas em vez de descartá-las silenciosamente", () => {
    const t = createTournament("Copa", "handball");
    expect(() => importCsv("Time A;Time B\nAzul;", t, [])).toThrow(/equipe B/);
    expect(() =>
      importCsv("Time A;Time B;Placar A;Placar B\nAzul;Verde;2;", t, []),
    ).toThrow(/dois placares/);
  });
});
