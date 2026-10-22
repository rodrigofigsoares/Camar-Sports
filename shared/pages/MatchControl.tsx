import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Undo2,
  Radio,
  Flag,
  Trash2,
} from "lucide-react";
import {
  monochromeText,
  sports,
  type Match,
  type Side,
  type User,
} from "../domain/model";
import {
  clockValue,
  formatTime,
  isTennis,
  pointLabel,
  usesSets,
  shootoutPoints,
  timeoutRemaining,
  penaltyRemaining,
} from "../domain/scoring";
import { api, navigate, platform, useMatch, useNow } from "@app/api";
import {
  Badge,
  Confirm,
  Field,
  Modal,
  Notice,
  Status,
  UrlBox,
} from "../components/ui";
import { Scoreboard } from "./Overlays";

export default function MatchControl({
  matchId,
  user,
}: {
  matchId: string;
  user: User;
}) {
  // Só a versão de nuvem põe visualizadores num preview que não salva.
  const sandbox = platform.viewerSandbox && user.role === "viewer";
  const {
      data: m,
      error,
      connected,
      command,
      busy,
      notice,
    } = useMatch(matchId, sandbox),
    now = useNow();
  const [modal, setModal] = useState<"settings" | "reset" | "delete" | null>(
      null,
    ),
    [players, setPlayers] = useState({ a: "", b: "" }),
    [extraError, setExtraError] = useState("");
  const [scoreEditor, setScoreEditor] = useState(false);
  const editable =
    sandbox ||
    (user.role !== "viewer" &&
      (user.role === "admin" ||
        user.sports.length === 0 ||
        (!!m && user.sports.includes(m.sport))));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !editable ||
        !m ||
        (e.target as HTMLElement).closest(
          "input,select,textarea,button,dialog",
        ) ||
        e.repeat
      )
        return;
      if (e.code === "Space") {
        if (busy) return;
        e.preventDefault();
        void command({
          type: "clock",
          action: m.clock.startedAt === null ? "start" : "pause",
        });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (busy) return;
        e.preventDefault();
        void command(undefined, true);
      } else if (
        !e.ctrlKey &&
        !e.metaKey &&
        ["a", "l"].includes(e.key.toLowerCase())
      )
        void command({
          type: "score",
          side: e.key.toLowerCase() === "a" ? "a" : "b",
          amount: 1,
        });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [m, busy, editable, command]);
  if (!m) return <Notice>{error || "Carregando partida…"}</Notice>;
  const tennis = isTennis(m),
    hasClock = !tennis && m.sport !== "volleyball",
    basketball = m.sport.startsWith("basketball");
  const time = clockValue(m.clock, now),
    running =
      m.clock.startedAt !== null &&
      (m.clock.direction === "down" ? time > 0 : time < m.clock.limit);
  const patch = (patch: Record<string, unknown>) =>
    command({ type: "patch", patch });
  const url = `${location.origin}/#/overlay/match/${m.id}`;
  return (
    <>
      <a
        className="back-link"
        href={m.tournamentId ? "#/tournaments/" + m.tournamentId : "#/"}
      >
        <ArrowLeft size={15} />
        {m.tournamentId ? "Voltar ao campeonato" : "Central de partidas"}
      </a>
      <header className="page-heading control-heading">
        <div>
          <span className="eyebrow">
            {sports[m.sport].name.toUpperCase()} · CONTROLE DE PARTIDA
          </span>
          <h1>
            {m.a.team.shortName} <span className="muted">vs.</span>{" "}
            {m.b.team.shortName}
          </h1>
          <p>
            {m.title || m.category || "Partida independente"}
            {m.venue && ` · ${m.venue}`}
          </p>
        </div>
        <div className="row">
          <Status value={m.status} />
          <button
            className="icon"
            onClick={() => setModal("settings")}
            title="Configurar partida"
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <Notice>
        {notice ||
          extraError ||
          error ||
          (!connected ? "Conexão interrompida. Reconectando ao servidor…" : "")}
      </Notice>
      {sandbox && <Notice>Cópia temporária · Experimente os controles no preview. As alterações não são salvas e não afetam a partida real. Ao sair deste painel, a cópia será descartada.</Notice>}
      <div className="control-layout">
        <div>
          <div className="score-controls">
            {(["a", "b"] as Side[]).map((side) => (
              <section className="panel team-control" key={side}>
                <div className="section-heading">
                  <div>
                    <Badge team={m[side].team} />
                    <h2>{m[side].team.shortName}</h2>
                  </div>
                  <span className="muted">EQUIPE {side.toUpperCase()}</span>
                </div>
                <div className="big-score">{pointLabel(m, side)}</div>
                <fieldset disabled={!editable}>
                  <div className="score-buttons">
                    <button
                      aria-label={`Remover ponto ${side.toUpperCase()}`}
                      onClick={() =>
                        command({ type: "score", side, amount: -1 })
                      }
                    >
                      <Minus size={19} />
                    </button>
                    <button
                      className="primary"
                      onClick={() =>
                        command({ type: "score", side, amount: 1 })
                      }
                    >
                      <Plus size={20} />
                      {tennis ? "Ponto" : "1"}
                    </button>
                    {(basketball || m.sport === "beachhandball") && (
                      <button
                        onClick={() =>
                          command({ type: "score", side, amount: 2 })
                        }
                      >
                        +2
                      </button>
                    )}
                    {m.sport === "basketball" && (
                      <button
                        onClick={() =>
                          command({ type: "score", side, amount: 3 })
                        }
                      >
                        +3
                      </button>
                    )}
                  </div>
                </fieldset>
                <fieldset disabled={!editable || busy}>
                  {usesSets(m) && (
                    <div className="counter-line">
                      <span>Sets vencidos</span>
                      <button
                        className="icon"
                        onClick={() =>
                          command({
                            type: "counter",
                            side,
                            field: "sets",
                            amount: -1,
                          })
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <b>{m[side].sets}</b>
                      <button
                        className="icon"
                        onClick={() =>
                          command({
                            type: "counter",
                            side,
                            field: "sets",
                            amount: 1,
                          })
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                  {tennis && (
                    <div className="counter-line">
                      <span>Games</span>
                      <button
                        className="icon"
                        onClick={() =>
                          command({
                            type: "counter",
                            side,
                            field: "games",
                            amount: -1,
                          })
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <b>{m[side].games}</b>
                      <button
                        className="icon"
                        onClick={() =>
                          command({
                            type: "counter",
                            side,
                            field: "games",
                            amount: 1,
                          })
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                  {(tennis || m.sport === "volleyball") && (
                    <button
                      className={`full ${m.serve === side ? "selected" : ""}`}
                      onClick={() => patch({ serve: side })}
                    >
                      ● {m.serve === side ? "Com o saque" : "Definir saque"}
                    </button>
                  )}
                  {(m.sport === "futsal" || basketball) && (
                    <div className="counter-line">
                      <span>Faltas</span>
                      <button
                        className="icon"
                        onClick={() =>
                          command({
                            type: "counter",
                            side,
                            field: "fouls",
                            amount: -1,
                          })
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <b>{m[side].fouls}</b>
                      <button
                        className="icon"
                        onClick={() =>
                          command({
                            type: "counter",
                            side,
                            field: "fouls",
                            amount: 1,
                          })
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                  {m.sport === "handball" && (
                    <>
                      <button className="full" disabled={m.status === "done"} onClick={() => command({ type: "sevenMeters", side })}>
                        7m · Exibir 7 METROS!
                      </button>
                      <div className="counter-line">
                        <span>Tempos técnicos</span>
                        {m[side].timeouts.map((used, i) => (
                          <button
                            key={i}
                            title={`Alternar tempo ${i + 1}`}
                            className={`timeout-dot ${used ? "used" : ""}`}
                            onClick={() =>
                              patch({
                                [side]: {
                                  ...m[side],
                                  timeouts: m[side].timeouts.map((v, j) =>
                                    i === j ? !v : v,
                                  ),
                                },
                              })
                            }
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <button
                        className="full"
                        onClick={() => command({ type: "timeout", side })}
                      >
                        Pedir tempo · 60s
                      </button>
                      <div className="penalty-input">
                        <input
                          aria-label={`Número do atleta ${side.toUpperCase()}`}
                          placeholder="Nº do atleta"
                          value={players[side]}
                          maxLength={8}
                          onChange={(e) =>
                            setPlayers({ ...players, [side]: e.target.value })
                          }
                        />
                        <button
                          disabled={!players[side].trim()}
                          onClick={() => {
                            void command({
                              type: "penalty",
                              side,
                              player: players[side],
                            });
                            setPlayers({ ...players, [side]: "" });
                          }}
                        >
                          + 2 min
                        </button>
                      </div>
                      <button
                        className="full danger-text"
                        disabled={!players[side].trim()}
                        onClick={() => {
                          void command({
                            type: "penalty",
                            side,
                            player: players[side],
                            isRedCard: true,
                          });
                          setPlayers({ ...players, [side]: "" });
                        }}
                      >
                        Cartão vermelho · 2 min
                      </button>
                      {m[side].penalties.map((p) => (
                        <div className="penalty-row" key={p.id}>
                          <span>
                            Atleta {p.player}
                            {p.isRedCard ? " · vermelho" : ""}
                          </span>
                          <b>
                            {formatTime(Math.ceil(penaltyRemaining(m, p.expiresAtPlay, now)))}
                          </b>
                          <button
                            className="icon"
                            title="Remover exclusão"
                            onClick={() =>
                              command({ type: "removePenalty", side, id: p.id })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {(m.sport === "volleyball" ||
                    m.sport === "beachhandball") && (
                    <button
                      className="full secondary-set"
                      onClick={() => command({ type: "finishSet", side })}
                    >
                      Encerrar set para {m[side].team.shortName}
                    </button>
                  )}
                  {basketball && (
                    <button
                      className={`full ${m.possession === side ? "selected" : ""}`}
                      onClick={() => patch({ possession: side })}
                    >
                      ←{" "}
                      {m.possession === side
                        ? "Posse de bola"
                        : "Definir posse"}
                    </button>
                  )}
                </fieldset>
              </section>
            ))}
          </div>
          <p className="muted" role="status">{busy ? "Salvando alterações…" : notice || error || !connected ? "Confira a conexão e o placar antes de continuar." : sandbox ? "Preview local · alterações não salvas" : "Placar sincronizado"}</p>
          {!tennis && (
            <section className="panel">
              <button disabled={!editable || busy || m.status === "done"} onClick={() => setScoreEditor(!scoreEditor)}>
                {scoreEditor ? "Cancelar ajuste" : "Ajustar placar diretamente"}
              </button>
              {scoreEditor && (
                <form onSubmit={event => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void command({ type: "setScore", a: Number(data.get("a")), b: Number(data.get("b")) });
                  setScoreEditor(false);
                }}>
                  <p>Informe o placar atual para iniciar ou retomar a transmissão. O período, o relógio e os sets já concluídos são mantidos.</p>
                  <fieldset disabled={!editable || busy}>
                    <div className="two-col">
                      {(["a", "b"] as Side[]).map(side => (
                        <Field key={side} label={`Placar ${m[side].team.shortName}`}>
                          <input name={side} type="number" min={0} max={999} step={1} required defaultValue={m[side].score} />
                        </Field>
                      ))}
                    </div>
                    <button className="primary">Aplicar placar</button>
                  </fieldset>
                </form>
              )}
            </section>
          )}
          {m.activeTimeout && timeoutRemaining(m, now) > 0 && (
            <div className="timeout-banner">
              <Pause size={18} />
              <strong>
                Tempo técnico · {m[m.activeTimeout.side].team.shortName}
              </strong>
              <b>
                {formatTime(Math.ceil(timeoutRemaining(m, now)))}
              </b>
              <button
                disabled={!editable || busy}
                onClick={() => command({ type: "endTimeout" })}
              >
                Encerrar
              </button>
            </div>
          )}
          {m.penaltyMode && (
            <section className="panel shootouts">
              <h2>
                Disputa de{" "}
                {m.sport === "beachhandball" ? "shoot-out" : "pênaltis"}
              </h2>
              <p className="muted">
                Registre a próxima cobrança diretamente nos botões. Para corrigir uma cobrança, clique na bolinha.
                {" "}
                {m.sport === "beachhandball"
                  ? "Clique para alternar: pendente → 1 ponto → 2 pontos → perdido."
                  : "Clique para alternar: pendente → convertido → perdido."}
              </p>
              <form className="shootout-config" onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void command({ type: "configureShootout", attempts: Number(data.get("attempts")) });
              }}>
                <label>Cobranças iniciais por equipe
                  <input key={m.shootoutAttempts ?? 5} name="attempts" type="number" min={1} max={20} required defaultValue={m.shootoutAttempts ?? 5} disabled={!editable || busy} />
                </label>
                <button disabled={!editable || busy}>Aplicar quantidade</button>
              </form>
              {(["a", "b"] as Side[]).map((side) => (
                <div className="shootout-row" key={side}>
                  <strong>{m[side].team.shortName}</strong>
                  <div>
                    {m[side].shootout.map((shot, i) => (
                      <button
                        key={i}
                        disabled={!editable || busy}
                        className={`shot ${shot}`}
                        onClick={() =>
                          command({ type: "shootout", side, index: i })
                        }
                        aria-label={`Cobrança ${i + 1} ${side.toUpperCase()}: ${shot}`}
                      >
                        {shot === "goal2"
                          ? "2"
                          : shot === "goal"
                            ? "✓"
                            : shot === "miss"
                              ? "×"
                              : i + 1}
                      </button>
                    ))}
                  </div>
                  <b>{shootoutPoints(m, side)}</b>
                  <div className="shootout-direct">
                    <span className="muted">{m[side].shootout.includes("pending") ? `Cobrança ${m[side].shootout.indexOf("pending") + 1}` : "Cobranças preenchidas"}</span>
                    {(["goal", ...(m.sport === "beachhandball" ? ["goal2" as const] : []), "miss"] as const).map((shot) => (
                      <button key={shot} disabled={!editable || busy || !m[side].shootout.includes("pending")}
                        onClick={() => command({ type: "shootout", side, index: m[side].shootout.indexOf("pending"), result: shot })}
                        aria-label={`${side.toUpperCase()}: ${shot === "goal2" ? "Registrar 2 pontos" : shot === "goal" ? "Registrar gol" : "Registrar erro"}`}>
                        {shot === "goal2" ? "+2 pontos" : shot === "goal" ? (m.sport === "beachhandball" ? "+1 ponto" : "Gol") : "Errou"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                disabled={!editable || busy}
                onClick={() => command({ type: "extraShootout" })}
              >
                Adicionar cobrança alternada
              </button>
              {m.a.shootout.length > (m.shootoutAttempts ?? 5) && (
                <button
                  disabled={!editable || busy}
                  onClick={() => command({ type: "removeExtraShootout" })}
                >
                  Remover última alternada
                </button>
              )}
            </section>
          )}
          <section className="panel preview-panel">
            <div className="section-heading">
              <div>
                <Radio size={16} />
                <h2>Prévia da transmissão</h2>
              </div>
              <span className="muted">1920 × 1080</span>
            </div>
            <div className="overlay-preview">
              <Scoreboard match={m} now={now} preview />
            </div>
          </section>
        </div>
        <aside className="control-aside">
          <section className="panel clock-panel">
            <span className="eyebrow">
              {hasClock ? "CRONÔMETRO" : "ANDAMENTO"}
            </span>
            <fieldset disabled={!editable || (platform.lockWhileSaving && busy)}>
              {(() => {
                const autoFinishPeriods: Record<string, string[]> = {
                  handball: ["1° TEMPO", "2° TEMPO", "1P", "2P"],
                  football: ["1° TEMPO", "2° TEMPO", "1P", "2P"],
                  futsal: ["1° TEMPO", "2° TEMPO", "1P", "2P"],
                  beachhandball: ["1° TEMPO", "2° TEMPO", "1P", "2P"],
                  basketball: ["1° QUARTO", "2° QUARTO", "3° QUARTO", "4° QUARTO", "PRORROGAÇÃO"],
                  basketball3x3: ["1° QUARTO", "2° QUARTO", "3° QUARTO", "4° QUARTO", "PRORROGAÇÃO"],
                };
                const options = autoFinishPeriods[m.sport];
                if (options) {
                  return (
                    <>
                      <select
                        className="period-input"
                        aria-label="Período"
                        value={m.period}
                        onChange={(e) => void patch({ period: e.target.value })}
                      >
                        {!options.includes(m.period) && (
                          <option value={m.period}>{m.period}</option>
                        )}
                        {options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <small>Selecione o período. A troca reinicia o cronômetro. No fim do período regulamentar, a partida encerra automaticamente se houver vencedor.</small>
                    </>
                  );
                }
                return (
                  <input
                    className="period-input"
                    aria-label="Período"
                    defaultValue={m.period}
                    key={m.period}
                    onBlur={(e) => {
                      if (
                        e.target.value.trim() !== m.period &&
                        e.target.value.trim()
                      )
                        void patch({ period: e.target.value });
                    }}
                  />
                );
              })()}
              {hasClock ? (
                <>
                  <div className={`clock-display ${running ? "running" : ""}`}>
                    {formatTime(
                      m.clock.direction === "down" ? Math.ceil(time) : time,
                    )}
                  </div>
                  <button
                    className="primary full"
                    onClick={() =>
                      command({
                        type: "clock",
                        action: running ? "pause" : "start",
                      })
                    }
                  >
                    {running ? <Pause size={18} /> : <Play size={18} />}
                    {running ? "Pausar" : "Iniciar"}
                    <kbd>Espaço</kbd>
                  </button>
                  <div className="clock-adjust">
                    <button
                      onClick={() =>
                        command({
                          type: "clock",
                          action: "adjust",
                          seconds: -1,
                        })
                      }
                    >
                      −1s
                    </button>
                    <button
                      title="Reiniciar cronômetro"
                      onClick={() =>
                        command({ type: "clock", action: "reset" })
                      }
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      onClick={() =>
                        command({ type: "clock", action: "adjust", seconds: 1 })
                      }
                    >
                      +1s
                    </button>
                  </div>
                  <div className="inline-field">
                    <span>Ajustar tempo</span>
                    <input
                      type="text"
                      placeholder="mm:ss"
                      aria-label="Tempo manual"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const match = /^(\d{1,3}):([0-5]\d)$/.exec(
                            e.currentTarget.value,
                          );
                          if (match) {
                            void command({
                              type: "clock",
                              action: "set",
                              seconds: Number(match[1]) * 60 + Number(match[2]),
                            });
                            e.currentTarget.value = "";
                          } else
                            setExtraError(
                              "Use o formato mm:ss para ajustar o relógio.",
                            );
                        }
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="set-summary">
                  <strong>
                    {m.a.sets} <span>:</span> {m.b.sets}
                  </strong>
                  <small>Melhor de {m.bestOf} sets</small>
                </div>
              )}
              {basketball && (
                <div className="shot-clock">
                  <span>RELÓGIO DE POSSE</span>
                  <b>{Math.ceil(clockValue(m.shotClock, now))}</b>
                  <div className="row">
                    {(m.sport === "basketball3x3"
                      ? [12, 14]
                      : [30, 15, 24, 14]
                    ).map((seconds) => (
                      <button
                        key={seconds}
                        onClick={() => command({ type: "shot", seconds })}
                      >
                        {seconds}s
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    placeholder="Posse personalizada (s)"
                    aria-label="Posse personalizada"
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        Number(e.currentTarget.value) > 0
                      )
                        void command({
                          type: "shot",
                          seconds: Number(e.currentTarget.value),
                        });
                    }}
                  />
                </div>
              )}
              <Field label="Situação">
                <select
                  value={m.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  <option value="scheduled">Agendada</option>
                  <option value="live">Ao vivo</option>
                  <option value="done">Encerrada</option>
                </select>
              </Field>
              <Field label="Vencedor no desempate">
                <select
                  value={m.tiebreakWinner ?? ""}
                  onChange={(e) =>
                    patch({ tiebreakWinner: e.target.value || null })
                  }
                >
                  <option value="">Não se aplica</option>
                  <option value="a">{m.a.team.shortName}</option>
                  <option value="b">{m.b.team.shortName}</option>
                </select>
              </Field>
            </fieldset>
          </section>
          <section className="panel">
            <h2>Transmissão</h2>
            <button
              disabled={!editable || busy}
              className={`full ${m.visible ? "selected" : ""}`}
              onClick={() => patch({ visible: !m.visible })}
            >
              {m.visible ? <Eye size={16} /> : <EyeOff size={16} />}
              {m.visible ? "Placar visível" : "Placar oculto"}
            </button>
            {!sandbox && <>
              <UrlBox url={url} />
              <small>Adicione este link como fonte de navegador no OBS.</small>
            </>}
          </section>
          <section className="panel actions-panel">
            <button
              disabled={!editable || busy}
              onClick={() => command(undefined, true)}
            >
              <Undo2 size={16} />
              Desfazer última ação
            </button>
            {["football", "futsal", "handball", "beachhandball"].includes(
              m.sport,
            ) && (
              <button
                disabled={!editable || busy}
                onClick={() => patch({ penaltyMode: !m.penaltyMode })}
              >
                <Flag size={16} />
                {m.penaltyMode ? "Ocultar" : "Exibir"} pênaltis / shoot-out
              </button>
            )}
            <button
              disabled={!editable || busy}
              onClick={() => setModal("reset")}
            >
              <RotateCcw size={16} />
              Reiniciar partida
            </button>
            {!sandbox && !m.tournamentId && (
              <button
                className="danger-text"
                disabled={!editable || busy}
                onClick={() => setModal("delete")}
              >
                <Trash2 size={16} />
                Excluir partida
              </button>
            )}
          </section>
          <small className="match-id">MATCH ID · {m.id}</small>
        </aside>
      </div>
      {m.setHistory.length > 0 && (
        <section className="panel">
          <h2>Histórico dos sets</h2>
          <div className="row">
            {m.setHistory.map((set, i) => (
              <span className="set-history" key={i}>
                {i + 1}º set{" "}
                <b>
                  {set.a} × {set.b}
                </b>
              </span>
            ))}
          </div>
        </section>
      )}
      {modal === "settings" && (
        <MatchSettings
          match={m}
          editable={editable}
          busy={busy}
          close={() => setModal(null)}
          save={async (patchValue, clock) => {
            if (!clock) await patch(patchValue);
            if (clock) await command({ type: "clockConfig", clock });
          }}
        />
      )}
      {modal === "reset" && (
        <Confirm
          title="Reiniciar esta partida?"
          text="Placar, relógios, sets, faltas e penalidades serão zerados. Resultados dependentes no campeonato serão recalculados. Você pode desfazer esta ação."
          close={() => setModal(null)}
          confirm={() => {
            void command({ type: "reset" });
            setModal(null);
          }}
        />
      )}
      {!sandbox && modal === "delete" && (
        <Confirm
          title="Excluir partida?"
          text={`A partida e seu histórico serão removidos da base ${platform.storageLabel}.`}
          close={() => setModal(null)}
          confirm={async () => {
            try {
              await api("matches/" + m.id, "DELETE", { revision: m.revision });
              navigate("/");
            } catch (e) {
              setExtraError((e as Error).message);
            }
            setModal(null);
          }}
        />
      )}
    </>
  );
}
function MatchSettings({
  match: m,
  editable,
  busy,
  close,
  save,
}: {
  match: Match;
  editable: boolean;
  busy: boolean;
  close: () => void;
  save: (
    patch: Record<string, unknown>,
    clock?: Match["clock"],
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState(m);
  return (
    <Modal title="Configurar partida" close={close} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await save({
            title: draft.title,
            category: draft.category,
            scheduledAt: draft.scheduledAt,
            venue: draft.venue,
            teamA: draft.a.team,
            teamB: draft.b.team,
            bestOf: draft.bestOf,
            pointsPerSet: draft.pointsPerSet,
            pointsTiebreak: draft.pointsTiebreak,
            autoSetPoint: draft.autoSetPoint,
            hasAdvantage: draft.hasAdvantage,
            tiebreak: draft.tiebreak,
          });
          close();
        }}
      >
        <fieldset disabled={!editable || busy}>
          <div className="two-col">
            <Field label="Identificação">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Local">
              <input
                value={draft.venue}
                onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
              />
            </Field>
            <Field label="Data e horário">
              <input
                type="datetime-local"
                value={draft.scheduledAt}
                onChange={(e) =>
                  setDraft({ ...draft, scheduledAt: e.target.value })
                }
              />
            </Field>
            <Field label="Categoria">
              <input
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="two-col">
            {(["a", "b"] as Side[]).map((side) => (
              <fieldset className="team-settings" key={side}>
                <legend>Equipe {side.toUpperCase()}</legend>
                <Field label="Nome oficial">
                  <input
                    disabled={!!m.tournamentId}
                    required
                    value={draft[side].team.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [side]: {
                          ...draft[side],
                          team: { ...draft[side].team, name: e.target.value.toLocaleUpperCase("pt-BR") },
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Nome no placar">
                  <input
                    disabled={!!m.tournamentId}
                    maxLength={24}
                    value={draft[side].team.shortName}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [side]: {
                          ...draft[side],
                          team: {
                            ...draft[side].team,
                            shortName: e.target.value.toLocaleUpperCase("pt-BR"),
                          },
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Grito de torcida (Gol)">
                  <input
                    disabled={!!m.tournamentId}
                    maxLength={80}
                    placeholder="PRA CIMA!"
                    value={draft[side].team.cheer ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [side]: {
                          ...draft[side],
                          team: {
                            ...draft[side].team,
                            cheer: e.target.value.toLocaleUpperCase("pt-BR"),
                          },
                        },
                      })
                    }
                  />
                </Field>
                <div className="two-col">
                  <Field label="Cor do uniforme no placar">
                    <input
                      type="color"
                      value={draft[side].team.color}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [side]: {
                            ...draft[side],
                            team: {
                              ...draft[side].team,
                              color: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Cor do texto">
                    <select
                      value={monochromeText(draft[side].team.textColor)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [side]: {
                            ...draft[side],
                            team: {
                              ...draft[side].team,
                              textColor: e.target.value,
                            },
                          },
                        })
                      }
                    >
                      <option value="#ffffff">Branco</option>
                      <option value="#000000">Preto</option>
                    </select>
                  </Field>
                </div>
              </fieldset>
            ))}
          </div>
          {m.tournamentId && (
            <small>
              As cores valem apenas para esta partida. Para editar os nomes,
              abra a aba Equipes do campeonato.
            </small>
          )}
          {usesSets(m) && (
            <Field label="Formato">
              <select
                value={draft.bestOf}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    bestOf: Number(e.target.value) as 1 | 3 | 5,
                  })
                }
              >
                <option value={1}>Melhor de 1 set (set único)</option>
                <option value={3}>Melhor de 3 sets</option>
                <option value={5}>Melhor de 5 sets</option>
              </select>
            </Field>
          )}
          {m.sport === "volleyball" && (
            <>
              <div className="two-col">
                <Field label="Pontos por set">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.pointsPerSet}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        pointsPerSet: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Pontos no tie-break">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.pointsTiebreak}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        pointsTiebreak: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.autoSetPoint}
                  onChange={(e) =>
                    setDraft({ ...draft, autoSetPoint: e.target.checked })
                  }
                />
                Exibir indicação de set point / match point
              </label>
            </>
          )}
          {isTennis(m) && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.hasAdvantage}
                  onChange={(e) =>
                    setDraft({ ...draft, hasAdvantage: e.target.checked })
                  }
                />
                Jogar com vantagem
              </label>
              <p className="muted">Sem vantagem, o ponto em 40–40 decide o game. O tie-break começa automaticamente em 6–6: vence quem fizer pelo menos 7 pontos, com 2 de diferença. O saque alterna após o primeiro ponto e depois a cada 2 pontos.</p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.tiebreak}
                  onChange={(e) =>
                    setDraft({ ...draft, tiebreak: e.target.checked })
                  }
                />
                Tie-break ativo (correção manual)
              </label>
            </>
          )}
          <div className="modal-actions">
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <button className="primary">Salvar configurações</button>
          </div>
        </fieldset>
      </form>
      {!isTennis(m) && m.sport !== "volleyball" && (
        <form
          className="clock-config"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              limit = Number(f.get("minutes")) * 60,
              direction = f.get("direction") as "up" | "down";
            await save(
              {},
              {
                value: direction === "up" ? 0 : limit,
                limit,
                direction,
                startedAt: null,
              },
            );
            close();
          }}
        >
          <h3>Configuração do relógio</h3>
          <div className="two-col">
            <Field label="Duração do período (min)">
              <input
                name="minutes"
                type="number"
                min={1}
                max={180}
                defaultValue={m.clock.limit / 60}
              />
            </Field>
            <Field label="Contagem">
              <select name="direction" defaultValue={m.clock.direction}>
                <option value="up">Progressiva</option>
                <option value="down">Regressiva</option>
              </select>
            </Field>
          </div>
          <button disabled={!editable || busy}>
            Aplicar e reiniciar relógio
          </button>
        </form>
      )}
    </Modal>
  );
}
