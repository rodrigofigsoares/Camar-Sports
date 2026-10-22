import type { Match, Tournament } from "../domain/model";
import { bracketLayout, type BracketColumn } from "../domain/bracket";
import { result } from "../domain/scoring";
import { outputLabel, resolve } from "../domain/tournament";
import { Badge } from "./ui";

export function TournamentBracket({
  tournament: t,
  matches,
  columns,
}: {
  tournament: Tournament;
  matches: Match[];
  columns: BracketColumn[];
}) {
  const layout = bracketLayout(t, columns);
  const projected = t.overlay.liveBracket ? resolve(t, matches, true) : null;
  return (
    <div className="progression-bracket">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Chaveamento e progressão das fases"
      >
        {columns.map((c, i) => (
          <text
            key={i}
            x={i * layout.step}
            y={28}
            className="bracket-round-title"
          >
            {c.title.length > 25 ? c.title.slice(0, 24) + "…" : c.title}
            <title>{c.title}</title>
          </text>
        ))}
        {layout.edges.map((e) => (
          <path
            key={e.id}
            d={e.path}
            className={e.loser ? "bracket-link loser" : "bracket-link"}
          />
        ))}
        {layout.nodes.map((n) => {
          if (n.bye) {
            const target = matches.find((m) => m.id === n.bye!.targetMatchId);
            const side = n.bye.slot === 0 ? "a" : "b";
            return (
              <foreignObject
                key={n.matchId}
                x={n.x}
                y={n.y}
                width={layout.cardWidth}
                height={n.height}
              >
                <article
                  className="bracket-bye"
                  title="Avanço direto às quartas de final"
                >
                  <Badge team={target?.[side].team} />
                  <span>{target?.[side].team.name ?? "A definir"}</span>
                  <b>BYE</b>
                </article>
              </foreignObject>
            );
          }
          const m = matches.find((m) => m.id === n.matchId);
          if (!m) return null;
          const stage = t.stages.find((s) => s.id === n.stageId);
          return (
            <foreignObject
              key={m.id}
              x={n.x}
              y={n.y}
              width={layout.cardWidth}
              height={n.height}
            >
              <article className="progression-match">
                <small title={stage?.name}>{stage?.name}</small>
                {(["a", "b"] as const).map((side, slot) => {
                  const link = t.links.find(
                    (l) => l.target === n.stageId && l.slot === slot,
                  );
                  const source = t.stages.find((s) => s.id === link?.source);
                  const origin = source
                    ? `${outputLabel(link!.output)} de ${source.name}`
                    : "A definir";
                  const pending = m[side].team.id.startsWith("pending-");
                  const projectedId = projected?.[n.stageId]?.slots[side === "a" ? (m.slotA ?? 0) : (m.slotB ?? 1)];
                  const projectedTeam = pending ? t.teams.find(team => team.id === projectedId) : undefined;
                  return (
                    <div key={side} title={link ? origin : m[side].team.name}>
                      <Badge team={pending ? projectedTeam : m[side].team} />
                      <span>{pending ? (projectedTeam ? projectedTeam.name + " *" : origin) : m[side].team.name}</span>
                      <b>{m.status === "scheduled" ? "—" : result(m, side)}</b>
                    </div>
                  );
                })}
              </article>
            </foreignObject>
          );
        })}
      </svg>
      <div className="bracket-legend">
        <span>━ Avanço do vencedor</span>
        {t.overlay.liveBracket && <span>* Classificação provisória · placares em tempo real</span>}
        {columns.some((c) => c.byes?.length) && (
          <span>BYE · avanço direto</span>
        )}
        {layout.edges.some((e) => e.loser) && <span>┄ Avanço do perdedor</span>}
      </div>
    </div>
  );
}
