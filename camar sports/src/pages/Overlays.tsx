import { TournamentBracket } from "../components/TournamentBracket";
import { OverlayCrossfade } from "../components/OverlayCrossfade";
import { Scoreboard } from "../components/Scoreboard21";
import { useMemo } from "react";
import { type Match, type Tournament } from "../domain/model";
import { result } from "../domain/scoring";
import { resolveOverlay, type Resolved } from "../domain/tournament";
import { useNow, useResource } from "../lib/api";
import { bracketPages, inGroup, type BracketColumn } from "../domain/bracket";
import { Badge } from "../components/ui";

export { Scoreboard } from "../components/Scoreboard21";

export function MatchOverlay({ matchId }: { matchId: string }) {
  const { data, error } = useResource<Match>("matches/" + matchId),
    now = useNow();
  if (!data) return error ? <div className="overlay-error">{error}</div> : null;
  return (
    <div className="match-overlay-stage">
      <Scoreboard match={data} now={now} />
    </div>
  );
}
type Scene = {
  key: string;
  title: string;
  subtitle: string;
  kind: "standings" | "bracket" | "results" | "upcoming";
  stageId?: string;
  columns?: BracketColumn[];
  ids: string[];
};
const chunk = <T,>(arr: T[], n: number) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n),
  );
export function scenes(
  t: Tournament,
  matches: Match[],
  resolved: Record<string, Resolved>,
): Scene[] {
  const list: Scene[] = [],
    stages = t.stages.filter(
      (s) =>
        (!t.overlay.category || s.category === t.overlay.category) &&
        (!(t.overlay.groupIds?.length || t.overlay.stageIds.length) ||
          t.overlay.stageIds.includes(s.id) ||
          inGroup(t, s.groupId, t.overlay.groupIds ?? [])),
    );
  for (const kind of t.overlay.screens) {
    if (kind === "standings")
      for (const s of stages.filter((s) => s.kind !== "knockout"))
        chunk(resolved[s.id].standings, 8).forEach((rows, page) =>
          list.push({
            key: `${kind}-${s.id}-${page}`,
            title: t.overlay.liveStandings ? "Classificação em tempo real" : "Classificação",
            subtitle: `${s.category} / ${s.name} · ${page + 1}`,
            kind,
            stageId: s.id,
            ids: rows.map((r) => r.teamId),
          }),
        );
    else if (kind === "bracket")
      bracketPages(t, stages, matches).forEach((page, index) =>
        list.push({
          key: `bracket-${index}`,
          title: t.overlay.liveBracket ? "Chaveamento em tempo real" : "Chaveamento",
          subtitle: `${page.category} · ${index + 1}`,
          kind,
          ids: [],
          columns: page.columns,
        }),
      );
    else {
      const filtered = matches
        .filter(
          (m) =>
            stages.some((s) => s.id === m.stageId) &&
            m.status === (kind === "results" ? "done" : "scheduled"),
        )
        .sort((a, b) =>
          (a.scheduledAt || "9999").localeCompare(b.scheduledAt || "9999"),
        );
      chunk(filtered, 4).forEach((rows, page) =>
        list.push({
          key: `${kind}-${page}`,
          title: kind === "results" ? "Resultados" : "Próximos jogos",
          subtitle: `${t.overlay.category || "Todas as categorias"} · ${page + 1}`,
          kind,
          ids: rows.map((m) => m.id),
        }),
      );
    }
  }
  return list;
}
export function TournamentOverlay({ tournamentId }: { tournamentId: string }) {
  const { data: t, error } = useResource<Tournament>(
      "tournaments/" + tournamentId,
    ),
    { data: ms } = useResource<Match[]>("matches?tournament=" + tournamentId),
    now = useNow();
  const resolved = useMemo(() => (t && ms ? resolveOverlay(t, ms) : {}), [t, ms]);
  const playlist = useMemo(
    () => (t && ms ? scenes(t, ms, resolved) : []),
    [t, ms, resolved],
  );
  if (!t || !ms)
    return error ? <div className="overlay-error">{error}</div> : null;
  if (!t.overlay.visible || !playlist.length) return null;
  const index = Math.floor(now / (t.overlay.seconds * 1000)) % playlist.length,
    scene = playlist[index];
  return (
    <OverlayCrossfade sceneKey={scene.key}>
      <div
        className={`tournament-overlay-stage${scene.kind === "bracket" ? " bracket-full-frame" : ""}`}
      >
        <section className="broadcast-panel" key={scene.key}>
          <header>
            <div>
              {t.organizer.trim() && <span>{t.organizer}</span>}
              <h1>{t.name}</h1>
            </div>
            <div className="broadcast-logo">
              <img src="/assets/logo-menu.png" alt="Camar Sports" width="652" height="148" />
            </div>
          </header>
          <div className="broadcast-section-title">
            <h2>{scene.title}</h2>
            <span>{scene.subtitle}</span>
          </div>
          {scene.kind === "standings" && (
            <table className="broadcast-table">
              <thead>
                <tr>
                  <th>POS</th>
                  <th>EQUIPE</th>
                  <th>J</th>
                  <th>V</th>
                  <th>E</th>
                  <th>D</th>
                  <th>GP</th>
                  <th>GC</th>
                  <th>SG</th>
                  <th>PTS</th>
                </tr>
              </thead>
              <tbody>
                {resolved[scene.stageId!].standings
                  .filter((row) => scene.ids.includes(row.teamId))
                  .map((row) => (
                    <tr key={row.teamId}>
                      <td>
                        {resolved[scene.stageId!].standings.indexOf(row) + 1}
                      </td>
                      <td>
                        <span>
                          <Badge
                            team={t.teams.find((x) => x.id === row.teamId)}
                          />
                          {t.teams.find((x) => x.id === row.teamId)?.name}
                        </span>
                      </td>
                      <td>{row.played}</td>
                      <td>{row.wins}</td>
                      <td>{row.draws}</td>
                      <td>{row.losses}</td>
                      <td>{row.scored}</td>
                      <td>{row.conceded}</td>
                      <td>{row.difference}</td>
                      <td>
                        <b>{row.points}</b>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          {(scene.kind === "results" || scene.kind === "upcoming") && (
            <div className="broadcast-fixtures">
              {scene.ids.map((mid) => {
                const m = ms.find((m) => m.id === mid)!;
                return (
                  <article key={mid}>
                    <div className="fixture-info">
                      {m.category} ·{" "}
                      {t.stages.find((s) => s.id === m.stageId)?.name}
                      <span>
                        {m.scheduledAt
                          ? new Date(m.scheduledAt).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "Horário a definir"}{" "}
                        {m.venue && `· ${m.venue}`}
                      </span>
                    </div>
                    <div className="fixture-teams">
                      <span>
                        <Badge team={m.a.team} />
                        {m.a.team.name}
                      </span>
                      <strong>
                        {scene.kind === "results"
                          ? `${result(m, "a")} : ${result(m, "b")}`
                          : "×"}
                      </strong>
                      <span>
                        {m.b.team.name}
                        <Badge team={m.b.team} />
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {scene.kind === "bracket" && (
            <TournamentBracket
              tournament={t}
              matches={ms}
              columns={scene.columns ?? []}
            />
          )}

          <footer>
            <span>
              {scene.kind === "standings"
                ? t.overlay.liveStandings
                  ? "Classificação provisória · inclui placares dos jogos em andamento"
                  : "Classificação atualizada pelos resultados confirmados"
                : "CAMAR SPORTS · ACOMPANHE O JOGO"}
            </span>
            <b>
              {index + 1} / {playlist.length}
            </b>
          </footer>
          <div
            className="slide-progress"
            style={{ animationDuration: `${t.overlay.seconds}s` }}
          />
        </section>
      </div>
    </OverlayCrossfade>
  );
}
