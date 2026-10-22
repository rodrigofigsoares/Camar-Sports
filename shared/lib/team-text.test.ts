import { expect, it } from "vitest";
import { uppercaseTeams } from "./team-text";
it("converte equipes de todos os campeonatos e partidas sem alterar outros dados", () => {
 const team = { id: "time-a", name: "São José", shortName: "São", cheer: "É gol!", color: "#aabbcc", textColor: "#ffffff" };
 const original = { tournaments: [{ name: "Copa local", organizer: "Organizador", teams: [team] }], matches: [{ a: { team }, b: { team: { ...team, id: "time-b", name: "União" } } }] };
 const result = uppercaseTeams(original);
 expect(result.tournaments[0].teams[0]).toEqual({ ...team, name: "SÃO JOSÉ", shortName: "SÃO", cheer: "É GOL!" });
 expect(result.matches[0].b.team.name).toBe("UNIÃO");
 expect(result.tournaments[0].name).toBe("Copa local");
 expect(result.tournaments[0].organizer).toBe("Organizador");
 expect(team.name).toBe("São José");
 expect(uppercaseTeams(result)).toEqual(result);
 expect(uppercaseTeams(null)).toBeNull();
});
