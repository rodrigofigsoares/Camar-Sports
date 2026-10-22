import { SqliteRepository } from "../server/repository.ts";
import { createMatch, team, type Sport } from "../../shared/domain/model.ts";
const repo = new SqliteRepository("artifacts/qa.sqlite");
for (const sport of [
  "handball",
  "basketball",
  "futsal",
  "volleyball",
] as Sport[]) {
  const m = createMatch(
    sport,
    { ...team("EQUIPE AZUL"), color: "#000033" },
    { ...team("EQUIPE LARANJA"), color: "#fd7506" },
  );
  m.id = `qa-overlay-${sport}`;
  m.period = sport === "basketball" ? "2º QUARTO" : "2º TEMPO";
  m.a.score = sport === "volleyball" ? 24 : 18;
  m.b.score = sport === "volleyball" ? 23 : 16;
  m.clock.value = 942;
  m.clock.limit = 1800;
  m.possession = "a";
  m.shotClock.value = 15;
  m.a.sets = 1;
  m.b.sets = 0;
  m.a.fouls = 3;
  m.b.fouls = 5;
  if (sport === "handball") {
    m.activeTimeout = { side: "a", startedAt: Date.now(), seconds: 60 };
    m.a.timeouts = [true, true, false];
    m.playElapsed = 100;
    m.a.penalties = [
      { id: "p1", player: "12", expiresAtPlay: 190 },
      { id: "p2", player: "7", expiresAtPlay: 215, isRedCard: true },
    ];
    m.b.penalties = [{ id: "p3", player: "22", expiresAtPlay: 145 }];
  }
  repo.put("match", m);
}
repo.db.close();
console.log("Quatro fixtures visuais criadas somente em artifacts/qa.sqlite.");
