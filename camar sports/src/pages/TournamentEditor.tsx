import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  GitBranch,
  GripVertical,
  LayoutGrid,
  List,
  Plus,
  Radio,
  Settings2,
  Shield,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  id,
  monochromeText,
  tiebreakerLabels,
  tiebreakLabelsForSport,
  type Sport,
  type Tiebreaker,
  sports,
  team,
  type Match,
  type Stage,
  type Team,
  type Tournament,
  type User,
} from "../../../shared/domain/model";
import {
  fixtures,
  generate,
  newStage,
  outputLabel,
  outputs,
  resolve,
  removeStages,
  editStage,
  type Format,
  type Resolved,
} from "../../../shared/domain/tournament";
import { result, usesSets } from "../../../shared/domain/scoring";
import { csvTemplate, exportCsv, importCsv } from "../../../shared/domain/csv";
import { api, download, navigate, useTournament } from "../lib/api";
import {
  Badge,
  Confirm,
  Empty,
  Field,
  Modal,
  Notice,
  Status,
  UrlBox,
} from "../../../shared/components/ui";

type FlowData = {
  stage: Stage;
  resolved: Resolved;
  teams: Team[];
  matches: Match[];
  open: (id: string) => void;
  editable: boolean;
};
type FlowNode = Node<FlowData, "phase">;
function PhaseNode({ data, selected }: NodeProps<FlowNode>) {
  const { stage: s, resolved: r, teams, matches } = data;
  const ms = matches.filter((m) => s.matchIds.includes(m.id));
  const live = ms.some((m) => m.status === "live");
  return (
    <article className={`phase-node ${selected ? "selected-node" : ""}`}>
      <div className="node-kind">
        <span>
          {s.kind === "knockout" ? <Trophy size={14} /> : <Users size={14} />}
          {s.kind === "knockout"
            ? "ELIMINATÓRIA"
            : s.kind === "swiss"
              ? "SUÍÇO"
              : s.kind === "league"
                ? "PONTOS CORRIDOS"
                : "FASE DE GRUPOS"}
        </span>
        <GripVertical size={16} />
      </div>
      <div className="node-title">
        <h3>{s.name}</h3>
        <span
          className={`mini-status ${live ? "live" : r.complete ? "done" : ""}`}
        >
          {live ? "Ao vivo" : r.complete ? "Concluída" : "A iniciar"}
        </span>
      </div>
      <small className="node-category">{s.category}</small>
      {s.kind === "knockout" ? (
        <div className="node-versus">
          {r.slots.map((tid, i) => (
            <div key={i}>
              <Badge team={teams.find((t) => t.id === tid)} />
              <span>
                {teams.find((t) => t.id === tid)?.shortName || "A definir"}
              </span>
              <b>
                {ms[0] && ms[0].status !== "scheduled"
                  ? result(ms[0], i === 0 ? "a" : "b")
                  : "—"}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <div className="node-standings">
          <div className="node-table-head">
            <span>Equipe</span>
            <span>J</span>
            <span>SG</span>
            <span>PTS</span>
          </div>
          {r.standings.slice(0, 4).map((row, i) => (
            <div className="node-standing" key={row.teamId}>
              <span className={i < s.advance ? "qualified" : ""}>{i + 1}</span>
              <span>{teams.find((t) => t.id === row.teamId)?.shortName}</span>
              <span>{row.played}</span>
              <span>{row.difference}</span>
              <b>{row.points}</b>
            </div>
          ))}
          {r.standings.length > 4 && (
            <small>+ {r.standings.length - 4} equipes</small>
          )}
          {r.standings.length === 0 && (
            <p className="muted">Conecte as vagas desta fase.</p>
          )}
        </div>
      )}
      <div className="node-footer">
        <span>
          {ms.filter((m) => m.status === "done").length} / {ms.length} jogos ·{" "}
          {s.kind === "knockout" ? "Jogo único" : `${s.advance} classificados`}
        </span>
        <button
          className="nodrag icon"
          aria-label={`Abrir fase ${s.name}`}
          onClick={() => data.open(s.id)}
        >
          <ArrowUpRight size={16} />
        </button>
      </div>
      {s.seeds.map((_, i) => (
        <Handle
          id={`slot-${i}`}
          key={`slot-${i}`}
          type="target"
          position={Position.Left}
          style={{ top: `${25 + (60 * (i + 1)) / (s.seeds.length + 1)}%` }}
          isConnectable={data.editable}
          title={`Entrada ${i + 1}`}
        />
      ))}
      {outputs(s).map((out, i, all) => (
        <Handle
          id={out}
          key={out}
          type="source"
          position={Position.Right}
          style={{ top: `${25 + (60 * (i + 1)) / (all.length + 1)}%` }}
          isConnectable={data.editable}
          title={outputLabel(out)}
        />
      ))}
    </article>
  );
}
const nodeTypes = { phase: PhaseNode };
const formats: [Format, string][] = [
  ["groups", "Fase de grupos"],
  ["league", "Liga · turno único"],
  ["return", "Liga · ida e volta"],
  ["single", "Eliminação simples"],
  ["double", "Eliminação dupla · final única"],
  ["ladder", "Escalada"],
  ["swiss", "Suíço"],
];
export default function TournamentEditor({
  tournamentId,
  user,
}: {
  tournamentId: string;
  user: User;
}) {
  const {
    data: t,
    matches,
    save,
    busy,
    notice,
    setNotice,
    error,
  } = useTournament(tournamentId);
  const [view, setView] = useState<"bracket" | "matches" | "teams" | "groups">(
      "bracket",
    ),
    [modal, setModal] = useState<
      "new" | "settings" | "overlay" | "delete" | "group" | null
    >(null),
    [selected, setSelected] = useState<string | null>(null),
    [graphRemoval, setGraphRemoval] = useState<string[] | null>(null),
    [editingGroup, setEditingGroup] = useState<string | null>(null),
    [category, setCategory] = useState(""),
    [filter, setFilter] = useState("all"),
    [nodes, setNodes] = useState<FlowNode[]>([]),
    [csvPreview, setCsvPreview] = useState<ReturnType<typeof importCsv> | null>(
      null,
    );
  const editable =
    user.role !== "viewer" &&
    (user.role === "admin" ||
      user.sports.length === 0 ||
      (!!t && user.sports.includes(t.sport)));
  const resolved = useMemo(() => (t ? resolve(t, matches) : {}), [t, matches]);
  useEffect(() => {
    if (t)
      setNodes(
        t.stages
          .filter((s) => !category || s.category === category)
          .map((s) => ({
            id: s.id,
            type: "phase",
            position: s.position,
            selected: s.id === selected,
            data: {
              stage: s,
              resolved: resolved[s.id],
              teams: t.teams,
              matches,
              open: setSelected,
              editable,
            },
          })),
      );
  }, [t, resolved, category, selected, matches, editable]);
  if (!t)
    return (
      <div className="main-content">
        <Notice>{error || "Carregando campeonato…"}</Notice>
      </div>
    );
  const selectedStage = t.stages.find((s) => s.id === selected),
    ms = matches.filter(
      (m) =>
        (!category || m.category === category) &&
        (filter === "all" || m.status === filter),
    );
  async function connect(c: Connection) {
    if (!t || !c.sourceHandle || !c.targetHandle) return;
    await save({
      ...t,
      links: [
        ...t.links,
        {
          id: id(),
          source: c.source,
          target: c.target,
          output: c.sourceHandle,
          slot: Number(c.targetHandle.slice(5)),
        },
      ],
    });
  }
  const url = `${location.origin}/#/overlay/tournament/${t.id}`;
  return (
    <>
      <div className="tournament-heading">
        <a className="back-link" href="#/tournaments">
          <ArrowLeft size={14} />
          Campeonatos
        </a>
        <header className="page-heading">
          <div>
            <span className="eyebrow">
              {sports[t.sport].name.toUpperCase()}{" "}
              {t.organizer && ` / ${t.organizer.toUpperCase()}`}
            </span>
            <h1>{t.name}</h1>
            <p>
              {t.teams.length} equipes <span>·</span> {t.stages.length} fases{" "}
              <span>·</span> {matches.length} partidas <span>·</span>{" "}
              <span className="accent">
                {matches.filter((m) => m.status === "live").length} ao vivo
              </span>
            </p>
          </div>
          <div className="row">
            <button onClick={() => setModal("overlay")}>
              <Radio size={16} />
              Transmissão
            </button>
            <button
              className="icon"
              title="Configurar campeonato"
              onClick={() => setModal("settings")}
            >
              <Settings2 size={18} />
            </button>
            {editable && (
              <button className="primary" onClick={() => setModal("new")}>
                <Plus size={17} />
                Nova fase
              </button>
            )}
          </div>
        </header>
        <Notice>{notice || error}</Notice>
        <div className="tournament-toolbar">
          <div className="tabs">
            {(
              [
                ["bracket", "Chaveamento", GitBranch],
                ["matches", "Partidas", List],
                ["teams", "Equipes", Shield],
                ["groups", "Conjuntos", LayoutGrid],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                onClick={() => setView(key)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div className="row">
            <select
              aria-label="Categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {t.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {view === "bracket" && (
              <button
                disabled={!editable || busy}
                title="Organizar fases"
                onClick={() => {
                  const depth = (
                    s: Stage,
                    visited = new Set<string>(),
                  ): number => {
                    if (visited.has(s.id)) return 0;
                    const parents = t.links.filter((l) => l.target === s.id);
                    return parents.length
                      ? 1 +
                          Math.max(
                            ...parents.map((l) =>
                              depth(
                                t.stages.find((p) => p.id === l.source)!,
                                new Set([...visited, s.id]),
                              ),
                            ),
                          )
                      : 0;
                  };
                  const counts: Record<number, number> = {};
                  void save({
                    ...t,
                    stages: t.stages.map((s) => {
                      const d = depth(s),
                        row = counts[d] ?? 0;
                      counts[d] = row + 1;
                      return { ...s, position: { x: d * 370, y: row * 340 } };
                    }),
                  });
                }}
              >
                <LayoutGrid size={15} />
                Organizar
              </button>
            )}
          </div>
        </div>
      </div>
      {view === "bracket" && (
        <div className="flow-area">
          {t.stages.length ? (
            <ReactFlow
              key={category}
              colorMode="dark"
              nodes={nodes}
              edges={t.links.map((l) => ({
                id: l.id,
                source: l.source,
                target: l.target,
                sourceHandle: l.output,
                targetHandle: `slot-${l.slot}`,
                type: "smoothstep",
                animated: false,
                label: outputLabel(l.output),
                style: { stroke: "#739e60", strokeWidth: 1.5 },
                labelStyle: { fill: "#a6b39f", fontSize: 10 },
                labelBgStyle: { fill: "#111613" },
              }))}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable={editable && !busy}
              nodesConnectable={editable && !busy}
              onNodesChange={(changes) =>
                setNodes((n) => applyNodeChanges(changes, n))
              }
              onBeforeDelete={async ({ nodes: removedNodes }) => {
                if (!editable || busy) return false;
                if (removedNodes.length) {
                  setGraphRemoval(removedNodes.map((node) => node.id));
                  return false;
                }
                return true;
              }}
              onNodeDragStop={(_, node) =>
                save({
                  ...t,
                  stages: t.stages.map((s) =>
                    s.id === node.id ? { ...s, position: node.position } : s,
                  ),
                })
              }
              onConnect={connect}
              onReconnect={(edge, connection) => {
                if (
                  !editable ||
                  busy ||
                  !connection.sourceHandle ||
                  !connection.targetHandle
                )
                  return;
                void save({
                  ...t,
                  links: t.links.map((l) =>
                    l.id === edge.id
                      ? {
                          ...l,
                          source: connection.source!,
                          target: connection.target!,
                          output: connection.sourceHandle!,
                          slot: Number(connection.targetHandle!.slice(5)),
                        }
                      : l,
                  ),
                });
              }}
              edgesReconnectable={editable && !busy}
              onEdgesDelete={(edges) => {
                if (editable)
                  void save({
                    ...t,
                    links: t.links.filter(
                      (l) => !edges.some((e) => e.id === l.id),
                    ),
                  });
              }}
              deleteKeyCode={editable ? "Delete" : null}
            >
              <Background color="#29322b" gap={24} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor="#456138"
                maskColor="#0b0e0bd9"
                pannable
                zoomable
              />
              <div className="flow-hint">
                Arraste as fases · Conecte classificações às vagas · Selecione
                uma conexão + Delete para remover
              </div>
            </ReactFlow>
          ) : (
            <Empty title="Desenhe o caminho até o título">
              <p>
                Cadastre suas equipes e crie fases. Depois, conecte os
                classificados de uma fase às vagas da próxima.
              </p>
              <div className="row">
                <button onClick={() => setView("teams")}>
                  <Users size={16} />
                  Cadastrar equipes
                </button>
                {editable && (
                  <button className="primary" onClick={() => setModal("new")}>
                    <Plus size={16} />
                    Criar primeira fase
                  </button>
                )}
              </div>
            </Empty>
          )}
        </div>
      )}
      {view === "matches" && (
        <div className="tab-content">
          <div className="section-heading">
            <div>
              <h2>Partidas do campeonato</h2>
              <select
                aria-label="Situação das partidas"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todas</option>
                <option value="scheduled">Agendadas</option>
                <option value="live">Ao vivo</option>
                <option value="done">Encerradas</option>
              </select>
            </div>
            <div className="row">
              <button
                onClick={() =>
                  download(
                    `modelo-${t.sport}.csv`,
                    csvTemplate(t),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <Download size={15} /> Modelo CSV
              </button>
              <button
                onClick={() =>
                  download(
                    `${t.name}.csv`,
                    exportCsv(t, matches),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <Download size={15} />
                Exportar CSV
              </button>
              {editable && (
                <label className="button">
                  <Upload size={15} />
                  Importar CSV
                  <input
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const preview = importCsv(
                          await file.text(),
                          t,
                          matches,
                        );
                        if (
                          !preview.matches.length &&
                          !preview.updates.length &&
                          preview.tournament.teams.length === t.teams.length
                        )
                          setNotice(
                            "CSV reconhecido, mas sem novos dados para importar. Preencha as linhas abaixo do cabeçalho; partidas já cadastradas são ignoradas.",
                          );
                        else setCsvPreview(preview);
                      } catch (e) {
                        setNotice((e as Error).message);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
          <div className="match-list">
            {ms.map((m) => (
              <button
                key={m.id}
                className="match-row"
                onClick={() => navigate("/matches/" + m.id)}
              >
                <div className="match-meta">
                  <span>{t.stages.find((s) => s.id === m.stageId)?.name}</span>
                  <small>
                    {m.scheduledAt
                      ? new Date(m.scheduledAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "Horário a definir"}
                    {m.venue && ` · ${m.venue}`}
                  </small>
                </div>
                <div className="match-teams">
                  <span>
                    <Badge team={m.a.team} />
                    {m.a.team.shortName}
                  </span>
                  <b>
                    {result(m, "a")}
                    <i>:</i>
                    {result(m, "b")}
                  </b>
                  <span>
                    {m.b.team.shortName}
                    <Badge team={m.b.team} />
                  </span>
                </div>
                <Status value={m.status} />
                <ArrowUpRight size={17} />
              </button>
            ))}
            {!ms.length && <Empty title="Nenhuma partida neste filtro" />}
          </div>
        </div>
      )}
      {view === "teams" && (
        <div className="tab-content">
          <TeamsEditor
            tournament={t}
            editable={editable}
            busy={busy}
            save={save}
          />
        </div>
      )}
      {view === "groups" && (
        <div className="tab-content">
          <div className="section-heading">
            <h2>Conjuntos de fases</h2>
            {editable && (
              <button className="primary" onClick={() => setModal("group")}>
                <Plus size={16} />
                Novo conjunto
              </button>
            )}
          </div>
          <p className="muted">
            Agrupe fases por categoria, etapa ou divisão. Conjuntos podem ter
            subconjuntos.
          </p>
          <div className="group-grid">
            {t.groups.map((g) => (
              <section className="panel" key={g.id}>
                <div className="section-heading">
                  <div>
                    <LayoutGrid size={18} />
                    <h3>{g.name}</h3>
                  </div>
                  {editable && (
                    <button
                      className="icon"
                      title="Remover conjunto"
                      onClick={() =>
                        save({
                          ...t,
                          groups: t.groups
                            .filter((x) => x.id !== g.id)
                            .map((x) =>
                              x.parentId === g.id
                                ? { ...x, parentId: g.parentId }
                                : x,
                            ),
                          stages: t.stages.map((s) =>
                            s.groupId === g.id ? { ...s, groupId: null } : s,
                          ),
                        })
                      }
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <small>
                  {g.parentId
                    ? `Dentro de ${t.groups.find((x) => x.id === g.parentId)?.name}`
                    : "Conjunto principal"}
                </small>
                {editable && (
                  <button disabled={busy} onClick={() => setEditingGroup(g.id)}>
                    Selecionar fases
                  </button>
                )}
                {t.stages
                  .filter((s) => s.groupId === g.id)
                  .map((s) => (
                    <button
                      className="group-phase"
                      key={s.id}
                      onClick={() => setSelected(s.id)}
                    >
                      {s.name}
                      <ChevronRight size={14} />
                    </button>
                  ))}
              </section>
            ))}
            {!t.groups.length && (
              <Empty title="Organize as fases em conjuntos" />
            )}
          </div>
        </div>
      )}
      {modal === "new" && (
        <PhaseCreator
          tournament={t}
          close={() => setModal(null)}
          save={save}
          busy={busy}
        />
      )}
      {selectedStage && (
        <StageEditor
          saveError={notice}
          stage={selectedStage}
          tournament={t}
          matches={matches}
          resolved={resolved[selectedStage.id]}
          editable={editable}
          busy={busy}
          save={save}
          close={() => setSelected(null)}
        />
      )}
      {modal === "settings" && (
        <TournamentSettings
          saveError={notice}
          tournament={t}
          editable={editable}
          busy={busy}
          save={save}
          close={() => setModal(null)}
          remove={() => setModal("delete")}
        />
      )}
      {modal === "overlay" && (
        <OverlaySettings
          tournament={t}
          editable={editable}
          busy={busy}
          save={save}
          close={() => setModal(null)}
          url={url}
        />
      )}
      {editingGroup && (
        <Modal
          title={`Fases de ${t.groups.find((g) => g.id === editingGroup)?.name}`}
          close={() => setEditingGroup(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const selectedIds = new FormData(e.currentTarget).getAll("stage");
              if (
                await save({
                  ...t,
                  stages: t.stages.map((s) =>
                    selectedIds.includes(s.id)
                      ? { ...s, groupId: editingGroup }
                      : s.groupId === editingGroup
                        ? { ...s, groupId: null }
                        : s,
                  ),
                })
              )
                setEditingGroup(null);
            }}
          >
            <p className="muted">
              Selecione as fases que formam esta etapa. Fases de outro conjunto
              serão transferidas para este.
            </p>
            <div className="check-grid">
              {t.stages.map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    name="stage"
                    value={s.id}
                    defaultChecked={s.groupId === editingGroup}
                  />
                  {s.name} · {s.category}
                  {s.groupId && s.groupId !== editingGroup
                    ? ` (${t.groups.find((g) => g.id === s.groupId)?.name})`
                    : ""}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Salvar fases do conjunto
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "group" && (
        <Modal title="Novo conjunto de fases" close={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await save({
                  ...t,
                  groups: [
                    ...t.groups,
                    {
                      id: id(),
                      name: String(f.get("name")),
                      parentId: String(f.get("parent")) || null,
                    },
                  ],
                })
              )
                setModal(null);
            }}
          >
            <Field label="Nome">
              <input name="name" required maxLength={80} />
            </Field>
            <Field label="Conjunto superior">
              <select name="parent">
                <option value="">Principal</option>
                {t.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Criar conjunto
              </button>
            </div>
          </form>
        </Modal>
      )}
      {graphRemoval && (
        <Confirm
          title="Excluir fases e partidas selecionadas?"
          text="As fases selecionadas, suas partidas e conexões serão removidas. Resultados dependentes poderão ser reiniciados."
          close={() => setGraphRemoval(null)}
          confirm={async () => {
            if (await save(removeStages(t, graphRemoval))) {
              setSelected(null);
              setGraphRemoval(null);
            }
          }}
        />
      )}
      {modal === "delete" && (
        <Confirm
          title="Excluir campeonato?"
          text="Todas as fases e partidas deste campeonato serão removidas. Exporte um backup antes de continuar se precisar conservar os resultados."
          close={() => setModal(null)}
          confirm={async () => {
            try {
              await api("tournaments/" + t.id, "DELETE", {
                revision: t.revision,
              });
              navigate("/tournaments");
            } catch (e) {
              setNotice((e as Error).message);
              setModal(null);
            }
          }}
        />
      )}
      {csvPreview && (
        <Confirm
          title="Revisar importação CSV"
          text={`${csvPreview.matches.length} partidas novas, ${csvPreview.updates.length} resultados a atualizar, ${csvPreview.tournament.teams.length - t.teams.length} equipes novas e ${csvPreview.skipped} linhas sem alteração. Os resultados atualizados recalculam os classificados; correções podem reiniciar partidas dependentes.`}
          close={() => setCsvPreview(null)}
          confirm={async () => {
            if (
              await save(
                csvPreview.tournament,
                csvPreview.matches,
                csvPreview.updates,
              )
            )
              setCsvPreview(null);
          }}
        />
      )}
    </>
  );
}
type Save = (t: Tournament, matches?: Match[]) => Promise<boolean>;
function TeamsEditor({
  tournament: t,
  editable,
  busy,
  save,
}: {
  tournament: Tournament;
  editable: boolean;
  busy: boolean;
  save: Save;
}) {
  const [editing, setEditing] = useState<Team | null>(null),
    [removing, setRemoving] = useState<Team | null>(null),
    [message, setMessage] = useState("");
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Equipes inscritas</h2>
          <span className="count">{t.teams.length}</span>
        </div>
        {editable && (
          <button
            className="primary"
            onClick={() => setEditing(team("", t.teams.length))}
          >
            <Plus size={16} />
            Nova equipe
          </button>
        )}
      </div>
      <div className="team-grid">
        {t.teams.map((x) => (
          <article className="panel team-card" key={x.id}>
            <Badge team={x} />
            <div>
              <h3>{x.name}</h3>
              <small>{x.shortName}</small>
            </div>
            {editable && (
              <>
                <button onClick={() => setEditing(x)}>Editar</button>
                <button
                  className="icon"
                  aria-label={`Excluir ${x.name}`}
                  onClick={() => setRemoving(x)}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </article>
        ))}
        {!t.teams.length && (
          <Empty title="Quem entra em quadra?">
            <p>Adicione nomes, cores e identificação para os placares.</p>
          </Empty>
        )}
      </div>
      {editing && (
        <Modal title="Equipe" close={() => setEditing(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editing.shortName.trim())
                editing.shortName = editing.name.slice(0, 16);
              if (
                await save({
                  ...t,
                  teams: [
                    ...t.teams.filter((x) => x.id !== editing.id),
                    editing,
                  ],
                })
              )
                setEditing(null);
              else
                setMessage(
                  "Não foi possível salvar. Feche esta janela e revise a mensagem no campeonato.",
                );
            }}
          >
            <Field label="Nome oficial">
              <input
                required
                maxLength={80}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value.toLocaleUpperCase("pt-BR") })
                }
              />
            </Field>
            <Field label="Nome para transmissão">
              <input
                maxLength={24}
                value={editing.shortName}
                onChange={(e) =>
                  setEditing({ ...editing, shortName: e.target.value.toLocaleUpperCase("pt-BR") })
                }
              />
            </Field>
            <Field label="Grito de torcida (Gol)">
              <input
                maxLength={80}
                placeholder="PRA CIMA!"
                value={editing.cheer ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, cheer: e.target.value.toLocaleUpperCase("pt-BR") })
                }
              />
            </Field>
            <div className="two-col">
              <Field label="Cor da equipe">
                <input
                  type="color"
                  value={editing.color}
                  onChange={(e) =>
                    setEditing({ ...editing, color: e.target.value })
                  }
                />
              </Field>
              <Field label="Cor do texto">
                <select
                  value={monochromeText(editing.textColor)}
                  onChange={(e) =>
                    setEditing({ ...editing, textColor: e.target.value })
                  }
                >
                  <option value="#ffffff">Branco</option>
                  <option value="#000000">Preto</option>
                </select>
              </Field>
            </div>
            <Notice>{message}</Notice>
            <div className="modal-actions">
              <button disabled={busy} className="primary">
                Salvar equipe
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Confirm
          title={`Excluir ${removing.name}?`}
          text="As vagas desta equipe ficarão vazias. Resultados de partidas com participantes alterados e suas fases dependentes serão reiniciados."
          close={() => setRemoving(null)}
          confirm={async () => {
            await save({
              ...t,
              teams: t.teams.filter((x) => x.id !== removing.id),
              stages: t.stages.map((s) => ({
                ...s,
                seeds: s.seeds.map((x) => (x === removing.id ? null : x)),
              })),
            });
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}
function PhaseCreator({
  tournament: t,
  close,
  save,
  busy,
}: {
  tournament: Tournament;
  close: () => void;
  save: Save;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"manual" | "generate">("generate"),
    [kind, setKind] = useState<Stage["kind"]>("group"),
    [format, setFormat] = useState<Format>("groups"),
    [selectedTeams, setSelectedTeams] = useState(t.teams.map((x) => x.id)),
    [message, setMessage] = useState("");
  return (
    <Modal title="Criar fases e partidas" close={close} wide>
      <div className="tabs">
        <button
          className={mode === "generate" ? "active" : ""}
          onClick={() => setMode("generate")}
        >
          Gerar competição
        </button>
        <button
          className={mode === "manual" ? "active" : ""}
          onClick={() => setMode("manual")}
        >
          Fase personalizada
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            category = String(f.get("category")),
            selected = t.teams.filter((x) => selectedTeams.includes(x.id));
          try {
            let next: Tournament, ms: Match[];
            if (mode === "generate") {
              const out = generate(
                t,
                format,
                selected,
                category,
                String(f.get("pairing")) as "seeded" | "sequential" | "random",
              );
              next = out.tournament;
              ms = out.matches;
            } else {
              const slots = Number(f.get("slots")),
                seeds = Array.from(
                  { length: kind === "knockout" ? 2 : slots },
                  (_, i) => selected[i]?.id ?? null,
                );
              const s = newStage(
                String(f.get("name")),
                kind,
                seeds,
                category,
                t.stages.length,
              );
              s.advance = Math.min(Number(f.get("advance")), seeds.length);
              s.rounds = Number(f.get("rounds")) as 1 | 2;
              ms = fixtures(t, s);
              s.matchIds = ms.map((m) => m.id);
              next = { ...t, stages: [...t.stages, s] };
            }
            if (await save(next, ms)) close();
            else
              setMessage(
                "Não foi possível salvar. Revise os dados e a mensagem no campeonato.",
              );
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <div className="two-col">
          <Field label="Categoria">
            <select name="category">
              {t.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {mode === "generate" ? (
            <Field label="Formato">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
              >
                {formats.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Tipo de fase">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Stage["kind"])}
              >
                <option value="group">Grupo</option>
                <option value="league">Pontos corridos</option>
                <option value="knockout">Confronto eliminatório</option>
                <option value="swiss">Suíço</option>
              </select>
            </Field>
          )}
        </div>
        {mode === "manual" ? (
          <>
            <Field label="Nome da fase">
              <input
                name="name"
                required
                maxLength={80}
                placeholder="Ex.: Semifinal 1"
              />
            </Field>
            <div className="three-col">
              <Field label="Vagas">
                <input
                  name="slots"
                  type="number"
                  min={2}
                  max={64}
                  defaultValue={4}
                  disabled={kind === "knockout"}
                />
              </Field>
              <Field label="Classificados">
                <input
                  name="advance"
                  type="number"
                  min={1}
                  max={64}
                  defaultValue={2}
                />
              </Field>
              <Field label="Turnos">
                <select name="rounds">
                  <option value={1}>Único</option>
                  {kind !== "knockout" && (
                    <option value={2}>Ida e volta</option>
                  )}
                </select>
              </Field>
            </div>
          </>
        ) : (
          <Field label="Ordem dos confrontos">
            <select name="pairing">
              <option value="seeded">1º × último · ordem de cadastro</option>
              <option value="sequential">Sequencial: 1º × 2º</option>
              <option value="random">Sorteio aleatório</option>
            </select>
          </Field>
        )}
        <div className="section-heading">
          <h3>Equipes participantes</h3>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setSelectedTeams(
                selectedTeams.length ? [] : t.teams.map((x) => x.id),
              )
            }
          >
            {selectedTeams.length ? "Limpar seleção" : "Selecionar todas"}
          </button>
        </div>
        <div className="check-grid">
          {t.teams.map((x) => (
            <label key={x.id}>
              <input
                type="checkbox"
                checked={selectedTeams.includes(x.id)}
                onChange={(e) =>
                  setSelectedTeams(
                    e.target.checked
                      ? [...selectedTeams, x.id]
                      : selectedTeams.filter((id) => id !== x.id),
                  )
                }
              />
              <Badge team={x} />
              {x.shortName}
            </label>
          ))}
        </div>
        <small>
          {mode === "manual"
            ? "Vagas sem equipe podem receber classificados pelas conexões do chaveamento."
            : format === "swiss"
              ? "A rodada seguinte é gerada na fase após encerrar todos os jogos da rodada atual."
              : "Os jogos gerados terão controles e URLs individuais."}
        </small>
        <Notice>{message}</Notice>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {mode === "generate" ? "Gerar fases e jogos" : "Criar fase"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function StageEditor({
  stage: s,
  tournament: t,
  matches,
  resolved: r,
  editable,
  busy,
  save,
  close,
  saveError,
}: {
  stage: Stage;
  tournament: Tournament;
  matches: Match[];
  resolved: Resolved;
  editable: boolean;
  busy: boolean;
  save: Save;
  close: () => void;
  saveError: string;
}) {
  const [tab, setTab] = useState("games"),
    [message, setMessage] = useState(""),
    [remove, setRemove] = useState(false);
  return (
    <Modal title={s.name} close={close} wide>
      <div className="tabs">
        <button
          className={tab === "games" ? "active" : ""}
          onClick={() => setTab("games")}
        >
          Partidas
        </button>
        <button
          className={tab === "standings" ? "active" : ""}
          onClick={() => setTab("standings")}
        >
          Classificação
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          Configurar fase
        </button>
      </div>
      {tab === "games" && (
        <>
          <div className="phase-game-grid">
            {s.matchIds.map((mid) => {
              const m = matches.find((m) => m.id === mid);
              return m ? (
                <ResultEditor
                  key={m.id}
                  match={m}
                  editable={editable}
                  refresh={() => {}}
                />
              ) : null;
            })}
          </div>
          {editable && s.kind === "swiss" && (
            <button
              disabled={
                busy ||
                !s.matchIds.every(
                  (mid) => matches.find((m) => m.id === mid)?.status === "done",
                )
              }
              onClick={async () => {
                const ms = fixtures(t, { ...s, seeds: r.slots }, matches);
                if (
                  !(await save(
                    {
                      ...t,
                      stages: t.stages.map((x) =>
                        x.id === s.id
                          ? {
                              ...s,
                              matchIds: [...s.matchIds, ...ms.map((m) => m.id)],
                            }
                          : x,
                      ),
                    },
                    ms,
                  ))
                )
                  setMessage("Não foi possível gerar a rodada.");
              }}
            >
              Gerar próxima rodada suíça
            </button>
          )}
        </>
      )}
      {tab === "standings" && <StandingsTable tournament={t} resolved={r} />}
      {tab === "settings" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const next = {
              ...s,
              kind: String(f.get("kind")) as Stage["kind"],
              tiebreakers: f.get("tiebreakers")
                ? (JSON.parse(String(f.get("tiebreakers"))) as Tiebreaker[])
                : undefined,
              name: String(f.get("name")),
              category: String(f.get("category")),
              groupId: String(f.get("group")) || null,
              advance: Number(f.get("advance")),
              seeds: s.seeds.map((value, i) =>
                f.has(`seed-${i}`) ? String(f.get(`seed-${i}`)) || null : value,
              ),
            };
            let updated: Tournament;
            try {
              updated = editStage(t, next);
            } catch (error) {
              setMessage((error as Error).message);
              return;
            }
            if (await save(updated)) setMessage("Fase salva.");
            else
              setMessage(
                "Não foi possível salvar; revise as vagas e conexões.",
              );
          }}
        >
          <fieldset disabled={!editable || busy}>
            <Field label="Tipo de fase">
              <select name="kind" defaultValue={s.kind}>
                <option value="group">Fase de grupos</option>
                <option value="league">Liga / pontos corridos</option>
                <option value="knockout">Confronto eliminatório</option>
                <option value="swiss">Suíço</option>
              </select>
            </Field>
            <Field label="Nome">
              <input name="name" required defaultValue={s.name} />
            </Field>
            <div className="three-col">
              <Field label="Categoria">
                <select name="category" defaultValue={s.category}>
                  {t.categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Conjunto">
                <select name="group" defaultValue={s.groupId ?? ""}>
                  <option value="">Sem conjunto</option>
                  {t.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Classificados">
                <input
                  name="advance"
                  type="number"
                  min={1}
                  max={s.seeds.length}
                  defaultValue={s.advance}
                />
              </Field>
            </div>
            {s.kind !== "knockout" && (
              <TiebreakEditor
                sport={t.sport}
                initial={s.tiebreakers}
                inherited={t.scoring.tiebreakers}
              />
            )}
            <h3>Conexões de entrada e saída</h3>
            <small>
              Desconectar pode reiniciar resultados dependentes se os
              participantes mudarem.
            </small>
            {t.links
              .filter((l) => l.source === s.id || l.target === s.id)
              .map((l) => (
                <div className="connected-slot" key={l.id}>
                  <span>
                    {t.stages.find((x) => x.id === l.source)?.name} ·{" "}
                    {outputLabel(l.output)} →{" "}
                    {t.stages.find((x) => x.id === l.target)?.name} · Vaga{" "}
                    {l.slot + 1}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await save({
                          ...t,
                          links: t.links.filter((x) => x.id !== l.id),
                        })
                      )
                        setMessage("Conexão removida.");
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              ))}
            {!t.links.some((l) => l.source === s.id || l.target === s.id) && (
              <p className="muted">Nenhuma conexão nesta fase.</p>
            )}
            <h3>Vagas da fase</h3>
            <div className="two-col">
              {s.seeds.map((value, i) => {
                const link = t.links.find(
                  (l) => l.target === s.id && l.slot === i,
                );
                return (
                  <Field label={`Vaga ${i + 1}`} key={i}>
                    {link ? (
                      <div className="connected-slot">
                        <span>
                          {outputLabel(link.output)} ·{" "}
                          {t.stages.find((x) => x.id === link.source)?.name}
                        </span>
                        <button
                          type="button"
                          className="icon"
                          aria-label={`Desconectar vaga ${i + 1}`}
                          onClick={() =>
                            save({
                              ...t,
                              links: t.links.filter((l) => l.id !== link.id),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <select name={`seed-${i}`} defaultValue={value ?? ""}>
                        <option value="">A definir</option>
                        {t.teams.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                );
              })}
            </div>
            <small>
              Alterar participantes reinicia os resultados desta fase e das
              fases dependentes afetadas.
            </small>
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={() => setRemove(true)}
              >
                Excluir fase
              </button>
              <button className="primary">Salvar fase</button>
            </div>
          </fieldset>
        </form>
      )}
      <Notice>{saveError || message}</Notice>
      {remove && (
        <Confirm
          title="Excluir fase e partidas?"
          text="As conexões da fase serão removidas e os resultados dependentes poderão ser reiniciados."
          close={() => setRemove(false)}
          confirm={async () => {
            if (await save(removeStages(t, [s.id]))) close();
          }}
        />
      )}
    </Modal>
  );
}
function ResultEditor({
  match: m,
  editable,
}: {
  match: Match;
  editable: boolean;
  refresh: () => void;
}) {
  const [a, setA] = useState(result(m, "a")),
    [b, setB] = useState(result(m, "b")),
    [status, setStatus] = useState(m.status),
    [winner, setWinner] = useState(m.tiebreakWinner ?? ""),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [baseRevision, setBaseRevision] = useState(m.revision);
  useEffect(() => {
    if (!dirty) {
      setA(result(m, "a"));
      setB(result(m, "b"));
      setStatus(m.status);
      setWinner(m.tiebreakWinner ?? "");
      setBaseRevision(m.revision);
    }
  }, [m, dirty]);
  const ready =
    !m.a.team.id.startsWith("pending-") && !m.b.team.id.startsWith("pending-");
  return (
    <form
      className="result-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const field = usesSets(m) ? "sets" : "score";
          await api("matches/" + m.id, "POST", {
            revision: baseRevision,
            command: {
              type: "patch",
              patch: {
                a: { ...m.a, [field]: a },
                b: { ...m.b, [field]: b },
                status,
                tiebreakWinner: winner || null,
              },
            },
          });
          setDirty(false);
          setMessage("Resultado salvo");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="section-heading">
        <Status value={m.status} />
        <a className="text-button" href={"#/matches/" + m.id}>
          Operar
          <ArrowUpRight size={14} />
        </a>
      </div>
      <fieldset disabled={!editable || busy || !ready}>
        {(["a", "b"] as const).map((side) => (
          <div className="score-line" key={side}>
            <Badge team={m[side].team} />
            <span>{m[side].team.shortName}</span>
            <input
              aria-label={`Resultado ${m[side].team.name}`}
              type="number"
              min={0}
              max={9999}
              value={side === "a" ? a : b}
              onChange={(e) => {
                (side === "a" ? setA : setB)(Number(e.target.value));
                setDirty(true);
              }}
            />
          </div>
        ))}
        <select
          aria-label="Status do resultado"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as Match["status"]);
            setDirty(true);
          }}
        >
          <option value="scheduled">Agendada</option>
          <option value="live">Ao vivo</option>
          <option value="done">Encerrada</option>
        </select>
        {a === b && status === "done" && (
          <Field label="Vencedor no desempate (eliminatórias)">
            <select
              value={winner}
              onChange={(e) => {
                setWinner(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">Sem desempate</option>
              <option value="a">{m.a.team.shortName}</option>
              <option value="b">{m.b.team.shortName}</option>
            </select>
          </Field>
        )}
        <button className="full" disabled={!dirty}>
          <Check size={14} />
          {ready ? "Salvar resultado" : "Aguardando equipes"}
        </button>
      </fieldset>
      <Notice>{message}</Notice>
    </form>
  );
}
export function StandingsTable({
  tournament: t,
  resolved: r,
}: {
  tournament: Tournament;
  resolved: Resolved;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Equipe</th>
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
          {r.standings.map((row, i) => (
            <tr key={row.teamId}>
              <td>{i + 1}</td>
              <td>
                <span className="table-team">
                  <Badge team={t.teams.find((x) => x.id === row.teamId)} />
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
              <td className="accent">
                <b>{row.points}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TournamentSettings({
  tournament: t,
  editable,
  busy,
  save,
  close,
  remove,
  saveError,
}: {
  tournament: Tournament;
  editable: boolean;
  busy: boolean;
  save: Save;
  close: () => void;
  remove: () => void;
  saveError: string;
}) {
  const [message, setMessage] = useState("");
  return (
    <Modal title="Configurar campeonato" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            categories = [
              ...new Set(
                String(f.get("categories"))
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean),
              ),
            ];
          if (t.stages.some((s) => !categories.includes(s.category))) {
            setMessage("Mantenha as categorias que já têm fases.");
            return;
          }
          const rules = JSON.parse(
            String(f.get("tiebreakers")),
          ) as Tiebreaker[];
          if (
            await save({
              ...t,
              name: String(f.get("name")),
              organizer: String(f.get("organizer")),
              categories: categories.length ? categories : ["Principal"],
              scoring: {
                win: Number(f.get("win")),
                draw: Number(f.get("draw")),
                loss: Number(f.get("loss")),
                volleyball: f.get("volleyball") === "on",
                tiebreakers: rules,
              },
            })
          )
            close();
          else
            setMessage(
              "Não foi possível salvar. Confira as regras informadas.",
            );
        }}
      >
        <fieldset disabled={!editable || busy}>
          <Field label="Nome">
            <input name="name" required defaultValue={t.name} maxLength={100} />
          </Field>
          <Field label="Organizador">
            <input
              name="organizer"
              defaultValue={t.organizer}
              maxLength={100}
            />
          </Field>
          <Field label="Categorias (uma por linha)">
            <textarea
              name="categories"
              defaultValue={t.categories.join("\n")}
              rows={3}
            />
          </Field>
          <h3>Pontuação da classificação</h3>
          <div className="three-col">
            {(["win", "draw", "loss"] as const).map((k, i) => (
              <Field label={["Vitória", "Empate", "Derrota"][i]} key={k}>
                <input
                  name={k}
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={t.scoring[k]}
                />
              </Field>
            ))}
          </div>
          {t.sport === "volleyball" && (
            <label className="checkbox">
              <input
                name="volleyball"
                type="checkbox"
                defaultChecked={t.scoring.volleyball}
              />
              Regra do vôlei: 3/0 ou 2/1 no set decisivo
            </label>
          )}
          <TiebreakEditor sport={t.sport} initial={t.scoring.tiebreakers} />
          <Notice>{saveError || message}</Notice>
          <div className="modal-actions">
            <button type="button" className="danger" onClick={remove}>
              Excluir campeonato
            </button>
            <button className="primary">Salvar</button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function OverlaySettings({
  tournament: t,
  editable,
  busy,
  save,
  close,
  url,
}: {
  tournament: Tournament;
  editable: boolean;
  busy: boolean;
  save: Save;
  close: () => void;
  url: string;
}) {
  const [organizer, setOrganizer] = useState(t.organizer);
  const [config, setConfig] = useState(t.overlay),
    [message, setMessage] = useState("");
  const labels = {
    standings: "Classificações",
    bracket: "Chaveamento",
    results: "Resultados encerrados",
    upcoming: "Próximos jogos",
  };
  return (
    <Modal title="Transmissão do campeonato" close={close} wide>
      <p className="muted">
        Telas paginadas em sequência, com fundo transparente. Configure a fonte
        de navegador do OBS em 1920 × 1080.
      </p>
      <fieldset disabled={!editable || busy}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={config.visible}
            onChange={(e) =>
              setConfig({ ...config, visible: e.target.checked })
            }
          />
          Overlay visível
        </label>
        <Field label="Organizador do campeonato">
          <input maxLength={100} value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Nome exibido no canto superior esquerdo" />
        </Field>
        <div className="two-col">
          <Field label="Segundos por tela">
            <input
              type="number"
              min={3}
              max={120}
              value={config.seconds}
              onChange={(e) =>
                setConfig({ ...config, seconds: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Categoria">
            <select
              value={config.category}
              onChange={(e) =>
                setConfig({ ...config, category: e.target.value })
              }
            >
              <option value="">Todas</option>
              {t.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={config.liveStandings ?? false}
            onChange={(e) => setConfig({ ...config, liveStandings: e.target.checked })}
          />
          Classificação em tempo real
        </label>
        <small>
          Inclui os placares dos jogos em andamento na classificação provisória.
          Desativado, considera apenas jogos encerrados. Ative também a tela Classificações abaixo.
        </small>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={config.liveBracket ?? false}
            onChange={(e) => setConfig({ ...config, liveBracket: e.target.checked })}
          />
          Chaveamento em tempo real
        </label>
        <small>Projeta os classificados antes do fim da fase, incluindo jogos em andamento. As vagas provisórias recebem um asterisco. Ative também a tela Chaveamento abaixo.</small>
        <h3>Telas e ordem de exibição</h3>
        {Object.entries(labels).map(([key, label]) => (
          <label className="checkbox" key={key}>
            <input
              type="checkbox"
              checked={config.screens.includes(key as keyof typeof labels)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  screens: e.target.checked
                    ? [...config.screens, key as keyof typeof labels]
                    : config.screens.filter((x) => x !== key),
                })
              }
            />
            {label}
          </label>
        ))}
        <div className="playlist">
          {config.screens.map((key, i) => (
            <div key={key}>
              <span>
                {i + 1}. {labels[key]}
              </span>
              <button
                disabled={i === 0}
                onClick={() => {
                  const screens = [...config.screens];
                  [screens[i - 1], screens[i]] = [screens[i], screens[i - 1]];
                  setConfig({ ...config, screens });
                }}
              >
                ↑
              </button>
              <button
                disabled={i === config.screens.length - 1}
                onClick={() => {
                  const screens = [...config.screens];
                  [screens[i], screens[i + 1]] = [screens[i + 1], screens[i]];
                  setConfig({ ...config, screens });
                }}
              >
                ↓
              </button>
            </div>
          ))}
        </div>
        <h3>Conjuntos incluídos</h3>
        <small>
          Inclui as fases do conjunto e de seus subconjuntos, inclusive fases
          adicionadas depois.
        </small>
        <div className="check-grid">
          {t.groups.map((g) => (
            <label key={g.id}>
              <input
                type="checkbox"
                checked={(config.groupIds ?? []).includes(g.id)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    groupIds: e.target.checked
                      ? [...(config.groupIds ?? []), g.id]
                      : (config.groupIds ?? []).filter((id) => id !== g.id),
                  })
                }
              />
              {g.name}
            </label>
          ))}
        </div>
        <h3>Fases incluídas</h3>
        <small>
          Sem seleção de fases ou conjuntos, inclui todas as fases da categoria
          escolhida.
        </small>
        <div className="check-grid">
          {t.stages.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={config.stageIds.includes(s.id)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    stageIds: e.target.checked
                      ? [...config.stageIds, s.id]
                      : config.stageIds.filter((x) => x !== s.id),
                  })
                }
              />
              {s.name}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button
            className="primary"
            onClick={async () => {
              if (await save({ ...t, organizer: organizer.trim(), overlay: config }))
                setMessage(
                  "Configuração salva. O overlay será atualizado automaticamente.",
                );
            }}
          >
            Salvar transmissão
          </button>
        </div>
      </fieldset>
      <UrlBox url={url} />
      <Notice>{message}</Notice>
    </Modal>
  );
}

function TiebreakEditor({
  initial,
  inherited,
  sport,
}: {
  sport: Sport;
  initial?: Tiebreaker[];
  inherited?: Tiebreaker[];
}) {
  const available = tiebreakLabelsForSport(sport);
  const labels = { ...tiebreakerLabels, ...available };
  const [rules, setRules] = useState<Tiebreaker[]>(initial ?? inherited ?? []);
  const [useDefault, setUseDefault] = useState(
    !!inherited && initial === undefined,
  );
  function move(index: number, delta: number) {
    const next = [...rules];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setRules(next);
  }
  return (
    <section>
      <h3>Critérios de desempate</h3>
      <input
        type="hidden"
        name="tiebreakers"
        value={useDefault ? "" : JSON.stringify(rules)}
      />
      {inherited && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={useDefault}
            onChange={(e) => setUseDefault(e.target.checked)}
          />
          Usar critérios do campeonato
        </label>
      )}
      <small>
        Os pontos da classificação vêm primeiro. Os critérios abaixo são
        aplicados na ordem definida. O confronto direto considera todos os times
        empatados em pontos, em uma tabela apenas com jogos entre eles.
        Persistindo a igualdade, usa-se o nome da equipe.
      </small>
      {useDefault ? (
        <p>{inherited?.map((r) => labels[r]).join(" → ")}</p>
      ) : (
        <>
          <div className="playlist">
            {rules.map((rule, i) => (
              <div key={rule}>
                <span>
                  {i + 1}. {labels[rule]}
                </span>
                <button
                  type="button"
                  aria-label={`Subir ${labels[rule]}`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Descer ${labels[rule]}`}
                  disabled={i === rules.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${labels[rule]}`}
                  onClick={() => setRules(rules.filter((r) => r !== rule))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <Field label="Adicionar critério">
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                setRules([...rules, e.target.value as Tiebreaker])
              }
            >
              <option value="">Selecione um critério</option>
              {(Object.keys(available) as Tiebreaker[])
                .filter((r) => !rules.includes(r))
                .map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={() =>
              setRules([
                "headToHead",
                "headDifference",
                "headScored",
                "difference",
                "scored",
              ])
            }
          >
            Priorizar confronto direto entre empatados
          </button>
        </>
      )}
    </section>
  );
}
