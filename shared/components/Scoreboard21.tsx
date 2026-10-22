import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { monochromeText, type Match, type Side } from "../domain/model";
import {
  clockValue,
  formatTime,
  isTennis,
  playingTime,
  pointLabel,
  shootoutPoints,
  timeoutRemaining,
  matchWinner,
  penaltyRemaining,
} from "../domain/scoring";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/space-mono/latin-700.css";
import "./scoreboard21.css";

/** Geometry, typography and animation timings from the supplied v2.1 overlays.
 * Match state is adapted here; the renderer has no storage or network writes.
 */
function useScoreAnimation(
  score: number,
  kind: "pop" | "basketball" | "goal" | "beach",
) {
  const previous = useRef(score);
  const [animation, setAnimation] = useState({
    pop: false,
    goal: false,
    fade: false,
    delta: 0,
    sequence: 0,
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const delta = score - previous.current;
    previous.current = score;
    if (!delta || (kind !== "pop" && delta < 0)) return;
    timers.current.forEach(clearTimeout);
    setAnimation((current) => ({
      pop: true,
      goal: kind === "goal",
      fade: kind === "goal" || (kind === "beach" && delta === 2),
      delta,
      sequence: current.sequence + 1,
    }));
    const later = (ms: number, patch: Partial<typeof animation>) =>
      timers.current.push(
        setTimeout(() => setAnimation((a) => ({ ...a, ...patch })), ms),
      );
    if (kind === "beach" && delta === 2) {
      // CSS owns the entire timeline; React only starts and clears it.
      later(2500, { pop: false, delta: 0, fade: false });
    } else if (kind === "goal") {
      later(1600, { fade: false, goal: false, pop: false, delta: 0 });
    } else {
      later(kind === "basketball" ? 200 : 300, { pop: false });
      if (kind === "basketball") later(800, { delta: 0 });
    }
  }, [score, kind]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return animation;
}
function Score({
  score,
  kind,
}: {
  score: number | string;
  kind: "pop" | "basketball" | "goal" | "beach";
}) {
  const a = useScoreAnimation(Number(score) || 0, kind);
  if (kind === "beach")
    return (
      <span key={a.sequence} className={`v1-beach-sequence ${a.delta === 2 ? "v1-beach-running" : ""}`}>
        <span className="v1-beach-word">
          <span className="v1-spectacular-label">
            {["ES", "PE", "TA", "CU", "LAR"].map((syllable, index) => (
              <span key={syllable} className="v1-syllable" style={{ animationDelay: `${index * 180}ms` }}>{syllable}</span>
            ))}
          </span>
        </span>
        <span className="v1-beach-two">
          <span className="v1-beach-add">+2</span>
        </span>
        <span className="v1-beach-number">
          <span className={`v21-score-pop ${a.pop && a.delta !== 2 ? "v21-pop" : ""}`}>{score}</span>
        </span>
      </span>
    );
  if (kind === "basketball")
    return a.delta > 0 ? (
      <span className={`v21-score-add ${a.pop ? "v21-pop-add" : ""}`}>
        +{a.delta}
      </span>
    ) : (
      <>{score}</>
    );
  if (kind === "goal")
    return (
      <span key={a.sequence} className={`v21-goal-grid v21-goal-sequence ${a.goal ? "v21-goal-running" : ""}`}>
        <span
          className="v21-goal-message"
        >
          {a.goal && (
            <span className="v21-wave">
              {Array.from("GOOOOL").map((letter, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.1}s` }}>
                  {letter}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="v21-goal-score">
          {score}
        </span>
      </span>
    );
  return (
    <span className={`v21-score-pop ${a.pop ? "v21-pop" : ""}`}>{score}</span>
  );
}
function Name({ match: m, side }: { match: Match; side: Side }) {
  const t = m[side],
    volleyball = m.sport === "volleyball",
    tennis = isTennis(m);
  const name = (
    <span className="v21-team-text">
      {(t.team.shortName || t.team.name).toUpperCase()}
    </span>
  );
  const setBox = <span className="v21-sets">{t.sets}</span>;
  return (
    <div className={`v21-name v21-name-${side}`}>
      <div className="v21-unskew v21-name-inner">
        {(volleyball || tennis || m.sport === "beachhandball") &&
          side === "a" &&
          setBox}
        {m.sport === "futsal" ? (
          <span className={`v21-foul-team v21-foul-team-${side}`}>
            {name}
            <span className="v21-fouls">
              {Array.from({ length: 5 }, (_, i) => (
                <i
                  key={i}
                  className={
                    i < t.fouls
                      ? t.fouls >= 5
                        ? "v21-foul-limit"
                        : "v21-foul-used"
                      : ""
                  }
                />
              ))}
            </span>
          </span>
        ) : (
          name
        )}
        {(volleyball || tennis || m.sport === "beachhandball") &&
          side === "b" &&
          setBox}
        {tennis && <span className="v21-games">{t.games}</span>}
      </div>
    </div>
  );
}
function Penalties({
  match: m,
  side,
  now,
}: {
  match: Match;
  side: Side;
  now: number;
}) {
  const elapsed = playingTime(m, now);
  const current = m[side].penalties;
  const activeIds = current.filter(p => p.expiresAtPlay > elapsed).map(p => p.id).join(",");
  const [shown, setShown] = useState(() => current.filter(p => p.expiresAtPlay > elapsed));
  useEffect(() => {
    const active = current.filter(p => activeIds.split(",").includes(p.id));
    setShown(previous => [...active, ...previous.filter(p => !active.some(next => next.id === p.id))]);
    const timer = setTimeout(() => setShown(active), 500);
    return () => clearTimeout(timer);
  }, [current, activeIds]);
  return (
    <div className={`v21-penalties v21-penalties-${side}`}>
      {shown
        .slice(0, 3)
        .map((p) => (
          <div
            className={`v21-penalty ${p.expiresAtPlay <= elapsed || !current.some(next => next.id === p.id) ? "v21-penalty-fading" : ""} ${p.isRedCard ? "v21-red-card" : ""}`}
            key={p.id}
          >
            <span className="v21-player">
              <span className="v21-unskew">{p.player}</span>
            </span>
            <span className="v21-penalty-clock">
              <span className="v21-unskew">
                {formatTime(Math.ceil(penaltyRemaining(m, p.expiresAtPlay, now)))}
              </span>
            </span>
          </div>
        ))}
    </div>
  );
}
function BroadcastCue({ cue, team, now }: { cue: NonNullable<Match["handballCue"]>; team: Match["a"]["team"]; now: number }) {
  const duration = cue.kind === "victory" ? 13000 : cue.kind === "goal" ? 8000 : 2500;
  // Server time only decides whether this event is still fresh. Once received,
  // play its full local timeline: transport latency must never skip the entrance.
  // The cue ID is the React key, so snapshots/ticks cannot restart this timeline.
  const [playback] = useState(() => ({ startedAt: now, fresh: now < cue.at + duration }));
  if (!playback.fresh || now >= playback.startedAt + duration) return null;
  const victory = cue.kind === "victory";
  const goal = cue.kind === "goal";
  const cheerPhrase = team.cheer?.trim() ? team.cheer : "PRA CIMA " + team.shortName.toUpperCase() + "!";
  return (
    <div className={`v1-handball-cue ${victory ? "v1-handball-victory" : goal ? `v1-goal-cue v1-goal-cue-${cue.side}` : `v1-handball-seven v1-handball-seven-${cue.side}`}`}
      role="status" style={{ backgroundColor: team.color, color: monochromeText(team.textColor) } as CSSProperties}>
      <i className="v1-victory-parallax" aria-hidden="true" />
      {victory ? <>
        <div className="v1-victory-intro" aria-hidden="true"><strong>
          {Array.from("VITÓRIA").map((letter, i) => <span className="v1-victory-letter" key={i} style={{ animationDelay: `${i * 110}ms` }}>{letter}</span>)}
        </strong></div>
        <div className="v1-victory-result"><strong>VITÓRIA</strong><span className={`v1-victory-name ${team.name.length > 26 ? "long-name" : ""}`}>{team.name.toUpperCase()}</span></div>
      </> : goal ? (
        <div className="v1-goal-container">
          <strong className="v1-goal-text">
            GOOOOOOOOOOOOOOOOOOL
          </strong>
          <strong className="v1-goal-cheer">
            {cheerPhrase.toUpperCase()}
          </strong>
        </div>
      ) : cue.kind === "set" ? <strong className="v1-seven-text">SET {team.shortName.toUpperCase()}!</strong> : <strong className="v1-seven-text">7 METROS!</strong>}
    </div>
  );
}
function Bar({ match: m, now }: { match: Match; now: number }) {
  const basketball = m.sport.startsWith("basketball"),
    volleyball = m.sport === "volleyball",
    tennis = isTennis(m),
    handball = m.sport === "handball";
  const time = clockValue(m.clock, now),
    shot = Math.ceil(clockValue(m.shotClock, now));
  const scoreKind =
    m.sport === "beachhandball"
      ? "beach"
      : basketball
        ? "basketball"
        : m.sport === "football"
          ? "goal"
          : "pop";
  const target =
    m.a.sets + m.b.sets === m.bestOf - 1 ? m.pointsTiebreak : m.pointsPerSet;
  const pointTeam =
    volleyball && m.autoSetPoint
      ? (["a", "b"] as Side[]).find(
          (side) =>
            m[side].score >= target - 1 &&
            m[side].score > m[side === "a" ? "b" : "a"].score,
        )
      : undefined;
  const pointState = pointTeam
    ? m[pointTeam].sets === Math.ceil(m.bestOf / 2) - 1
      ? "MATCHPOINT"
      : "SETPOINT"
    : null;
  const sideExtras = (side: Side): ReactNode => (
    <>
      {basketball && (
        <div
          className={`v21-shotclock v21-shotclock-${side} ${m.possession === side ? "v21-extra-visible" : ""}`}
        >
          <span
            className={`v21-unskew ${shot === 0 && m.possession === side ? "v21-shot-zero" : ""}`}
          >
            {String(shot).padStart(2, "0")}
          </span>
        </div>
      )}
      {handball && (
        <>
          <div
            className={`v21-timeout v21-timeout-${side} ${m.activeTimeout?.side === side && timeoutRemaining(m, now) > 0 ? "v21-extra-visible" : ""}`}
            style={{
              backgroundColor: m[side].team.color,
              color: monochromeText(m[side].team.textColor),
            }}
          >
            <span className="v21-unskew">
              T{Math.max(1, m[side].timeouts.filter(Boolean).length)}
            </span>
          </div>
          <Penalties match={m} side={side} now={now} />
        </>
      )}
      {volleyball && (
        <div
          className={`v21-point-state v21-point-state-${side} ${pointTeam === side ? "v21-point-visible" : ""}`}
        >
          <div
            style={{
              backgroundColor: m[side].team.color,
              color: monochromeText(m[side].team.textColor),
            }}
          >
            <span
              className={`v21-unskew ${pointTeam === side ? "v21-pulse" : ""}`}
            >
              {pointState || "MATCHPOINT"}
            </span>
          </div>
        </div>
      )}
    </>
  );
  return (
    <div className="v21-mainbar">
      {((handball && m.handballCue?.kind === "seven") ||
        (volleyball && m.handballCue?.kind === "set" && m.status !== "done") ||
        ((m.sport === "futsal" || m.sport === "football") && m.handballCue?.kind === "goal")) && (
        <BroadcastCue key={m.handballCue.id} cue={m.handballCue} team={m[m.handballCue.side].team} now={now} />
      )}
      {sideExtras("a")}
      {(volleyball || tennis) && (
        <div
          className="v21-servebar"
          style={{
            backgroundColor: m[m.serve].team.color,
            transform: `translateX(${m.serve === "a" ? "-405px" : "145px"}) skewX(-15deg)`,
          }}
        />
      )}
      <Name match={m} side="a" />
      <div
        className="v21-scorecell v21-scorecell-a"
        style={{
          backgroundColor: m.a.team.color,
          color: monochromeText(m.a.team.textColor),
        }}
      >
        <span className="v21-unskew v21-score-value">
          <Score score={pointLabel(m, "a")} kind={scoreKind} />
        </span>
      </div>
      {volleyball || tennis ? (
        <div className="v21-divider" />
      ) : (
        <div className="v21-center">
          <span className="v21-unskew v21-time">
            {formatTime(m.clock.direction === "down" ? Math.ceil(time) : time)}
          </span>
        </div>
      )}
      <div
        className="v21-scorecell v21-scorecell-b"
        style={{
          backgroundColor: m.b.team.color,
          color: monochromeText(m.b.team.textColor),
        }}
      >
        <span className="v21-unskew v21-score-value">
          <Score score={pointLabel(m, "b")} kind={scoreKind} />
        </span>
      </div>
      <Name match={m} side="b" />
      {sideExtras("b")}
    </div>
  );
}
function TennisCard({ match: m }: { match: Match }) {
  const winner = matchWinner(m);
  const gameEvent = m.tennisGame ?? (m.serveBreak ? { ...m.serveBreak, kind: "break" as const } : null);
  const seenBreak = useRef(gameEvent?.id);
  const [activeBreak, setActiveBreak] = useState<Match["tennisGame"]>(null);
  useEffect(() => {
    const event = gameEvent;
    if (seenBreak.current === event?.id) return;
    seenBreak.current = event?.id;
    setActiveBreak(null);
    if (!event || Date.now() - event.at > 3000) return;
    setActiveBreak(event);
    const timer = setTimeout(() => setActiveBreak(null), 2500);
    return () => clearTimeout(timer);
  }, [gameEvent?.id]);
  return (
    <div className="v1-tennis" aria-label="Placar de tênis">
      {(["a", "b"] as const).map((side) => (
        <div
          key={side}
          className="v1-tennis-row"
          style={{ borderLeftColor: m[side].team.color }}
        >
          <div className="v1-tennis-name">
            <span>
              <i className={m.serve === side ? "serving" : ""} />
              {(m[side].team.shortName || m[side].team.name).toUpperCase()}
            </span>
          </div>
          <div className="v1-tennis-sets">
            <span>
              <Score score={m[side].sets} kind="pop" />
            </span>
          </div>
          <div className="v1-tennis-games">
            <span>
              <Score score={m[side].games} kind="pop" />
            </span>
          </div>
          <div className="v1-tennis-points">
            <span>
              <Score score={pointLabel(m, side)} kind="pop" />
            </span>
          </div>
          {!winner && activeBreak?.side === side && (
            <div key={activeBreak.id} className={`v1-serve-break ${activeBreak.kind === "set" ? "v1-tennis-set" : activeBreak.kind === "hold" ? "v1-serve-hold" : ""}`} aria-label={activeBreak.kind === "set" ? "Set vencido" : activeBreak.kind === "hold" ? "Game de saque vencido" : "Quebra de saque"}>
              <i className="v1-serve-break-parallax" />
              <strong>{activeBreak.kind === "set" ? "SET" : activeBreak.kind === "hold" ? "GAME" : "BREAK!"}</strong>
            </div>
          )}
        </div>
      ))}

    </div>
  );
}
function ShootoutCard({ match: m }: { match: Match }) {
  return (
    <div className="v1-shootout" aria-label="Placar das cobranças">
      <header>
        <span>
          {m.sport === "beachhandball"
            ? "SHOOT-OUT"
            : m.sport === "handball"
              ? "DISPUTA 7M"
              : "DISPUTA DE PÊNALTIS"}
        </span>
      </header>
      {(["a", "b"] as const).map((side) => (
        <div key={side} className="v1-shootout-row">
          <div
            className="v1-shootout-name"
            style={{ borderLeftColor: m[side].team.color }}
          >
            <span>{(m[side].team.shortName || m[side].team.name).toUpperCase()}</span>
          </div>
          <div className="v1-shootout-total">
            <span>
              <Score
                score={shootoutPoints(m, side)}
                kind={m.sport === "beachhandball" ? "beach" : "pop"}
              />
            </span>
          </div>
          <div className="v1-shootout-shots">
            <span>
              {m[side].shootout.map((shot, i) => (
                <i
                  key={i}
                  className={`v1-shot-${shot}`}
                  aria-label={`Cobrança ${i + 1}: ${shot}`}
                >
                  {shot === "goal2" ? "2" : shot === "miss" ? "×" : ""}
                </i>
              ))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
export function Scoreboard({
  match: m,
  now,
  preview = false,
}: {
  match: Match;
  now: number;
  preview?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600);
  useEffect(() => {
    if (!preview || !ref.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [preview]);
  // Paint the hidden pose before revealing a newly mounted broadcast source.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let revealFrame = 0;
    const paintFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(paintFrame);
      cancelAnimationFrame(revealFrame);
    };
  }, []);
  const winner = matchWinner(m);
  const victoryCue = m.victoryCue ?? (m.sport === "handball" && m.handballCue?.kind === "victory" ? m.handballCue : null);
  const victoryStarted = !!victoryCue && winner === victoryCue.side;
  const canvas = (
    <div
      className={`v21-canvas v21-${m.sport} ${victoryStarted ? "v21-victory-started" : ""} ${!entered || !m.visible ? "v21-hidden" : ""}`}
      aria-hidden={!m.visible}
    >
      {isTennis(m) ? (
        <TennisCard match={m} />
      ) : (
        <div
          className={`v21-layout ${m.penaltyMode ? "v1-main-hidden" : ""}`}
          aria-hidden={m.penaltyMode || victoryStarted}
        >
          {m.sport !== "volleyball" && !isTennis(m) && (
            <div className="v21-period-wrap">
              <div className="v21-period">
                <span className="v21-unskew">{m.period}</span>
              </div>
            </div>
          )}
          <Bar match={m} now={now} />
        </div>
      )}
      {!isTennis(m) && (
        <div
          className={`v1-shootout-layer ${m.penaltyMode ? "active" : ""}`}
          aria-hidden={!m.penaltyMode || victoryStarted}
        >
          <ShootoutCard match={m} />
        </div>
      )}
      {victoryStarted && victoryCue && (
        <div className="v1-handball-victory-stage">
          <BroadcastCue key={victoryCue.id} cue={{ ...victoryCue, kind: "victory" }} team={m[victoryCue.side].team} now={now} />
        </div>
      )}
    </div>
  );
  return preview ? (
    <div
      ref={ref}
      className="v21-preview"
      style={{ height: Math.max(110, (width / 1440) * 275) }}
    >
      <div
        className="v21-preview-scaled"
        style={{ transform: `translateX(-50%) scale(${width / 1440})` }}
      >
        {canvas}
      </div>
      {!m.visible && (
        <span className="v21-preview-hidden">Placar oculto na transmissão</span>
      )}
    </div>
  ) : (
    canvas
  );
}
