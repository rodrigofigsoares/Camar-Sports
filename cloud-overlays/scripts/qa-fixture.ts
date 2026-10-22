// Disposable UI test fixture. This never opens data/camar.sqlite.
import { scryptSync } from "node:crypto";
import { SqliteRepository } from "../server/repository.ts";
import {
  createMatch,
  createTournament,
  team,
  type Sport,
} from "../../shared/domain/model.ts";
import { generate } from "../../shared/domain/tournament.ts";
const repo = new SqliteRepository("artifacts/qa.sqlite");
const salt = "local-development-fixture";
repo.put("user", {
  id: "qa-user",
  name: "Operação de teste",
  username: "qa",
  role: "admin",
  sports: [],
  disabled: false,
  passwordHash:
    salt + ":" + scryptSync("local-qa-2026", salt, 64).toString("hex"),
});
// Username must conform to the login schema.
repo.put("user", {
  id: "qa-user",
  name: "Operação de teste",
  username: "qa-local",
  role: "admin",
  sports: [],
  disabled: false,
  passwordHash:
    salt + ":" + scryptSync("local-qa-2026", salt, 64).toString("hex"),
});
for (const [sport, name, organizer] of [
  ["handball", "Copa Metropolitana 2026", "LIGA METROPOLITANA"],
  ["futsal", "Liga Universitária", "ESPORTE UNIVERSITÁRIO"],
  ["volleyball", "Circuito de Vôlei", "TEMPORADA 2026"],
] as [Sport, string, string][]) {
  const t = createTournament(name, sport);
  t.organizer = organizer;
  t.teams = [
    "Pinheiros",
    "Taubaté",
    "São Caetano",
    "Santos",
    "Guarulhos",
    "São José",
    "Sorocaba",
    "Campinas",
  ].map((name, i) => team(name, i));
  const out = generate(t, "groups", t.teams, "Principal");
  out.matches.slice(0, 3).forEach((m, i) => {
    m.a.score = [28, 24, 32][i];
    m.b.score = [24, 26, 21][i];
    m.status = "done";
  });
  if (sport === "handball") {
    const m = out.matches[3];
    m.status = "live";
    m.a.score = 18;
    m.b.score = 16;
    m.clock.value = 942;
    m.period = "2º tempo";
  }
  out.matches.forEach((m) => repo.put("match", m));
  repo.put("tournament", out.tournament);
}
const m = createMatch("tennis", team("Marina Costa"), team("Luiza Silva", 1));
m.title = "Final feminina · amistoso";
m.a.games = 3;
m.b.games = 2;
m.a.points = 3;
m.b.points = 2;
repo.put("match", m);
repo.db.close();
console.log("Fixture local criada em artifacts/qa.sqlite.");
