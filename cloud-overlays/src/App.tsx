import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Database,
  LayoutGrid,
  LogOut,
  Monitor,
  Plus,
  Search,
  Settings2,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import {
  sports,
  team,
  id,
  type Match,
  type Sport,
  type Tournament,
  type User,
} from "../../shared/domain/model";
import {
  api,
  download,
  navigate,
  syncTime,
  useResource,
  type Session,
} from "./lib/api";
import {
  Badge,
  Confirm,
  Empty,
  Field,
  Modal,
  Notice,
  Status,
} from "../../shared/components/ui";
import { SportCourt } from "../../shared/components/SportCourt";
import MatchControl from "./pages/MatchControl";
import TournamentEditor from "./pages/TournamentEditor";
import { MatchOverlay, TournamentOverlay } from "./pages/Overlays";

function Login({
  setup,
  onLogin,
}: {
  setup: boolean;
  onLogin: (user: User) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-art">
        <div className="brand">
          camar<span>sports</span>
        </div>
        <div>
          <span className="eyebrow">DA QUADRA PARA A TELA</span>
          <h1>
            O jogo acontece.
            <br />
            <em>Você comanda.</em>
          </h1>
          <p>
            O seu estúdio de operação esportiva.
            <br />
            Partidas, campeonatos e transmissão em um só lugar.
          </p>
        </div>
        <span className="muted">CAMAR SPORTS · CLOUD OVERLAYS</span>
      </div>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            onLogin(
              await api<User>(
                setup ? "setup" : "login",
                "POST",
                Object.fromEntries(f),
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">
          {setup ? "VAMOS COMEÇAR" : "BEM-VINDO DE VOLTA"}
        </span>
        <h2>{setup ? "Prepare seu estúdio" : "Entre no estúdio"}</h2>
        <p className="muted">
          {setup
            ? "Crie o administrador do Cloud Overlays."
            : "Use seu perfil para acessar a operação."}
        </p>
        {setup && (
          <Field label="Código de instalação">
            <input name="setupToken" type="password" required autoComplete="off" />
          </Field>
        )}
        {setup && (
          <Field label="Seu nome">
            <input name="name" required autoComplete="name" />
          </Field>
        )}
        <Field label="Usuário">
          <input
            name="username"
            required
            minLength={3}
            autoComplete="username"
          />
        </Field>
        <Field label="Senha">
          <input
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete={setup ? "new-password" : "current-password"}
            placeholder="Pelo menos 8 caracteres"
          />
        </Field>
        <Notice>{error}</Notice>
        <button className="primary" disabled={busy}>
          {busy ? "Entrando…" : setup ? "Criar estúdio" : "Entrar"}
          <ArrowUpRight size={17} />
        </button>
        <small>
          Dados salvos na nuvem. Seus overlays têm links próprios para
          transmissão.
        </small>
      </form>
    </div>
  );
}
function CreateMatch({ close }: { close: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Nova partida" close={close}>
      <p className="muted">
        Uma partida independente, com controle e overlay exclusivos.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const m = await api<Match>("matches", "POST", {
              sport: f.get("sport"),
              a: team(String(f.get("a"))),
              b: team(String(f.get("b")), 1),
              title: f.get("title"),
            });
            navigate("/matches/" + m.id);
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Modalidade">
          <select name="sport">
            {Object.entries(sports).map(([k, s]) => (
              <option key={k} value={k}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nome / identificação">
          <input
            name="title"
            placeholder="Ex.: Amistoso de sábado"
            maxLength={120}
          />
        </Field>
        <div className="two-col">
          <Field label="Equipe A">
            <input
              name="a"
              required
              maxLength={80}
              placeholder="Nome da equipe"
            />
          </Field>
          <Field label="Equipe B">
            <input
              name="b"
              required
              maxLength={80}
              placeholder="Nome da equipe"
            />
          </Field>
        </div>
        <Notice>{error}</Notice>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button disabled={busy} className="primary">
            Criar partida
            <ChevronRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CreateTournament({ close }: { close: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Novo campeonato" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const t = await api<Tournament>(
              "tournaments",
              "POST",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            navigate("/tournaments/" + t.id);
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nome do campeonato">
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Ex.: Copa Metropolitana 2026"
          />
        </Field>
        <Field label="Organizador">
          <input name="organizer" maxLength={100} placeholder="Nome exibido no cabeçalho do overlay" />
        </Field>
        <Field label="Modalidade">
          <select name="sport">
            {Object.entries(sports).map(([k, s]) => (
              <option key={k} value={k}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Notice>{error}</Notice>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button disabled={busy} className="primary">
            Criar campeonato
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Dashboard({
  tournamentsOnly,
  user,
}: {
  tournamentsOnly: boolean;
  user: User;
}) {
  const ms = useResource<Match[]>("matches"),
    ts = useResource<Tournament[]>("tournaments");
  const [modal, setModal] = useState<"match" | "tournament" | null>(null);
  const matches = (ms.data ?? []).filter(m => !m.tournamentId), tournaments = ts.data ?? [];
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">SEU ESTÚDIO, EM JOGO</span>
          <h1>
            {tournamentsOnly ? "Campeonatos" : "Visão geral"}
          </h1>
          <p>
            {tournamentsOnly
              ? "Da primeira rodada à grande final. Tudo conectado."
              : "Tudo pronto para a próxima transmissão."}
          </p>
        </div>
        {user.role !== "viewer" && (
          <button
            className="primary"
            onClick={() => setModal(tournamentsOnly ? "tournament" : "match")}
          >
            <Plus size={18} />
            {tournamentsOnly ? "Novo campeonato" : "Nova partida"}
          </button>
        )}
      </header>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Seus campeonatos</h2>
            <span className="count">{tournaments.length}</span>
          </div>
          {!tournamentsOnly && user.role !== "viewer" && (
            <button
              className="text-button"
              onClick={() => setModal("tournament")}
            >
              <Plus size={15} />
              Novo campeonato
            </button>
          )}
        </div>
        <div className="tournament-cards">
          {tournaments.map((t) => (
            <button
              className="tournament-card"
              key={t.id}
              onClick={() => navigate("/tournaments/" + t.id)}
            >
              <div className="tournament-art">
                <SportCourt sport={t.sport} />
                <span className="sport-tag">{sports[t.sport].name}</span>
                <span className="card-arrow">
                  <ArrowUpRight size={20} />
                </span>
              </div>
              <div className="tournament-card-body">
                <small>{t.organizer || "CAMPEONATO"}</small>
                <h3>{t.name}</h3>
                <p>
                  <Users size={14} />
                  {t.teams.length} equipes<span>·</span>
                  {t.stages.length} fases
                </p>
              </div>
            </button>
          ))}
          {!tournaments.length && (
            <Empty title="Seu próximo campeonato começa aqui">
              <p>Adicione equipes e conecte as fases do seu torneio.</p>
              {user.role !== "viewer" && (
                <button onClick={() => setModal("tournament")}>
                  <Plus size={16} />
                  Criar campeonato
                </button>
              )}
            </Empty>
          )}
        </div>
      </section>
      {!tournamentsOnly && (
        <section className="section">
          <div className="section-heading">
            <div>
              <h2>Partidas avulsas</h2>
              <span className="count">{matches.length}</span>
            </div>
          </div>
          <div className="match-list home-match-list">
            {matches.map((m) => (
              <button
                className="match-row"
                key={m.id}
                onClick={() => navigate("/matches/" + m.id)}
              >
                <div className="match-meta">
                  <span className="match-competition">{sports[m.sport].name}</span>
                  <small className="match-category">{m.title || m.category || "Partida avulsa"}</small>
                </div>
                <div className="match-teams">
                  <span>
                    <Badge team={m.a.team} />
                    <span className="match-team-name">{m.a.team.shortName}</span>
                  </span>
                  <b>
                    {[
                      "volleyball",
                      "tennis",
                      "beachtennis",
                      "beachhandball",
                    ].includes(m.sport)
                      ? m.a.sets
                      : m.a.score}
                    <i>:</i>
                    {[
                      "volleyball",
                      "tennis",
                      "beachtennis",
                      "beachhandball",
                    ].includes(m.sport)
                      ? m.b.sets
                      : m.b.score}
                  </b>
                  <span>
                    <span className="match-team-name">{m.b.team.shortName}</span>
                    <Badge team={m.b.team} />
                  </span>
                </div>
                <Status value={m.status} />
                <ArrowUpRight size={18} />
              </button>
            ))}
            {!matches.length && <Empty title="Nenhuma partida avulsa"><p>Crie uma partida avulsa para começar.</p></Empty>}
          </div>
        </section>
      )}
      <Notice>{ms.error || ts.error}</Notice>
      {modal === "match" && <CreateMatch close={() => setModal(null)} />}
      {modal === "tournament" && (
        <CreateTournament close={() => setModal(null)} />
      )}
    </>
  );
}
function UsersPage({ user }: { user: User }) {
  const { data, setData, refresh, error } = useResource<User[]>("users");
  const [deleting, setDeleting] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [editing, setEditing] = useState<User | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">QUEM FAZ A TRANSMISSÃO</span>
          <h1>Equipe do estúdio</h1>
          <p>Perfis e permissões de operação.</p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setEditing({
              id: id(),
              name: "",
              username: "",
              role: "operator",
              sports: [],
              disabled: false,
            })
          }
        >
          <Plus size={17} />
          Novo usuário
        </button>
      </header>
      <div className="panel">
        {data?.map((u) => (
          <div className="user-row" key={u.id}>
            <div className="avatar">{u.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{u.name}</strong>
              <small>
                @{u.username} ·{" "}
                {u.disabled
                  ? "Desativado"
                  : u.role === "admin"
                    ? "Administrador"
                    : u.role === "operator"
                      ? "Operador"
                      : "Visualizador"}
              </small>
            </div>
            <span className="muted">
              {u.sports.length
                ? u.sports.map((s) => sports[s].name).join(", ")
                : "Todas as modalidades"}
            </span>
            <button onClick={() => setEditing(u)}>Editar</button>
            {u.id !== user.id && (
              <button
                className="danger"
                aria-label={`Excluir ${u.name}`}
                onClick={() => { setNotice(""); setDeleteError(""); setDeleting(u); }}
              >
                Excluir
              </button>
            )}
          </div>
        ))}
      </div>
      <Notice>{error || notice}</Notice>
      {deleting && (
        <Modal title="Excluir usuário?" close={() => { if (!busy) setDeleting(null); }}>
          <p className="muted">
            Excluir {deleting.name} (@{deleting.username}) permanentemente? O acesso
            será revogado. Partidas e campeonatos serão preservados.
          </p>
          <Notice>{deleteError}</Notice>
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button>
            <button className="danger" disabled={busy} onClick={async () => {
              if (busy) return;
              setBusy(true);
              setDeleteError("");
              try {
                await api(`users/${deleting.id}`, "DELETE");
                setData((data ?? []).filter(u => u.id !== deleting.id));
                setDeleting(null);
                setNotice("Usuário excluído.");
                await refresh();
              } catch (e) {
                setDeleteError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}>
              {busy ? "Excluindo…" : "Excluir usuário"}
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title={
            data?.some((u) => u.id === editing.id)
              ? "Editar usuário"
              : "Novo usuário"
          }
          close={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget),
                password = String(f.get("password"));
              try {
                await api("users", "POST", {
                  user: editing,
                  ...(password ? { password } : {}),
                });
                setEditing(null);
                await refresh();
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nome">
              <input
                required
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <Field label="Usuário">
              <input
                required
                minLength={3}
                value={editing.username}
                onChange={(e) =>
                  setEditing({ ...editing, username: e.target.value })
                }
              />
            </Field>
            <Field label="Senha (deixe vazia para manter)">
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required={!data?.some((u) => u.id === editing.id)}
              />
            </Field>
            <Field label="Perfil">
              <select
                value={editing.role}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value as User["role"],
                  })
                }
              >
                <option value="admin">Administrador</option>
                <option value="operator">Operador</option>
                <option value="viewer">Visualizador</option>
              </select>
            </Field>
            <p className="muted">
              Modalidades permitidas. Nenhuma seleção libera todas.
            </p>
            <div className="check-grid">
              {Object.entries(sports).map(([key, s]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={editing.sports.includes(key as Sport)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        sports: e.target.checked
                          ? [...editing.sports, key as Sport]
                          : editing.sports.filter((x) => x !== key),
                      })
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editing.disabled}
                onChange={(e) =>
                  setEditing({ ...editing, disabled: e.target.checked })
                }
              />
              Desativar acesso
            </label>
            <Notice>{notice}</Notice>
            <div className="modal-actions">
              {editing.id !== user.id && data?.some(u => u.id === editing.id) && (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    setNotice("");
                    setDeleteError("");
                    setDeleting(editing);
                    setEditing(null);
                  }}
                >
                  Excluir usuário
                </button>
              )}
              <button className="primary" disabled={busy}>
                Salvar usuário
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function SettingsPage({ user }: { user: User }) {
  const [notice, setNotice] = useState(""),
    [backup, setBackup] = useState<unknown>(null);
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">SEU AMBIENTE DE TRABALHO</span>
          <h1>Configurações</h1>
          <p>Dados na nuvem e orientações para transmissão.</p>
        </div>
      </header>
      <div className="settings-grid">
        <section className="panel">
          <Database className="accent" size={26} />
          <h2>Base de dados na nuvem</h2>
          <p>
            Partidas, campeonatos e usuários ficam salvos na nuvem.
            As alterações são enviadas aos painéis e overlays assim que são salvas.
            A velocidade depende da conexão. Os cronômetros continuam animando entre atualizações.
          </p>
          {user.role === "admin" && (
            <>
              <button
                onClick={async () => {
                  try {
                    download("camar-sports-backup.json", await api("backup"));
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                <ArrowDownToLine size={16} />
                Exportar backup
              </button>
              <label className="button import-button">
                Importar backup
                <input
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setBackup(JSON.parse(await file.text()));
                    } catch {
                      setNotice("Arquivo JSON inválido.");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}
          <small>
            A importação acrescenta registros com IDs novos. Usuários e senhas
            não são incluídos no backup.
          </small>
        </section>
        <section className="panel">
          <Monitor className="accent" size={26} />
          <h2>Pronto para o OBS</h2>
          <p>
            Abra uma partida e copie a URL em “Transmissão”. No OBS, adicione
            uma fonte de navegador com resolução de 1920 × 1080.
          </p>
          <p>
            Para exibir classificações e resultados em sequência, use o overlay
            do campeonato.
          </p>
          <small>
            Use o endereço HTTPS do overlay em qualquer computador conectado
            à internet. O computador da versão offline pode permanecer desligado.
          </small>
        </section>
        <section className="panel">
          <CircleHelp className="accent" size={26} />
          <h2>Atalhos de operação</h2>
          <p>
            <kbd>Espaço</kbd> Iniciar / pausar cronômetro
          </p>
          <p>
            <kbd>A</kbd> Ponto equipe A <kbd>L</kbd> Ponto equipe B
          </p>
          <p>
            <kbd>Ctrl Z</kbd> Desfazer última ação
          </p>
          <small>Atalhos ficam inativos enquanto você preenche um campo.</small>
        </section>
      </div>
      <Notice>{notice}</Notice>
      {backup !== null && (
        <Confirm
          title="Importar backup?"
          text="Os campeonatos e partidas do arquivo serão adicionados à base na nuvem. IDs que já existem serão recusados para preservar seus dados."
          close={() => setBackup(null)}
          confirm={async () => {
            try {
              await api("backup", "POST", backup);
              setNotice("Backup importado.");
              setBackup(null);
            } catch (e) {
              setNotice((e as Error).message);
              setBackup(null);
            }
          }}
        />
      )}
    </>
  );
}
export default function App() {
  const [path, setPath] = useState(location.hash.slice(1) || "/"),
    [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const listener = () => setPath(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    const load = () =>
      api<Session>("session")
        .then((s) => {
          syncTime(s.serverTime);
          setSession(s);
        })
        .catch((e) => setError(e.message));
    void load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
  const parts = path.split("/").filter(Boolean);
  const overlay = parts[0] === "overlay";
  useEffect(() => {
    document.body.classList.toggle("overlay-page", overlay);
    document.documentElement.classList.toggle("overlay-page", overlay);
  }, [overlay]);
  if (overlay && !session) return <Notice>{error || "Verificando acesso…"}</Notice>;
  if (overlay && session?.user?.role === "viewer")
    return <Notice>O perfil visualizador tem acesso somente ao preview no painel. <a href="#/">Voltar aos painéis</a></Notice>;
  if (overlay)
    return parts[1] === "match" ? (
      <MatchOverlay key={parts[2]} matchId={parts[2]} />
    ) : (
      <TournamentOverlay key={parts[2]} tournamentId={parts[2]} />
    );
  if (!session)
    return (
      <div className="loading">
        <div className="brand">
          camar<span>sports</span>
        </div>
        <p>{error || "Abrindo o estúdio…"}</p>
        {error && (
          <button onClick={() => location.reload()}>Tentar novamente</button>
        )}
      </div>
    );
  if (!session.user)
    return (
      <Login
        setup={session.setup}
        onLogin={(user) => setSession({ ...session, user, setup: false })}
      />
    );
  const u = session.user,
    items = [
      { path: "/", name: "Visão geral", icon: LayoutGrid },
      { path: "/tournaments", name: "Campeonatos", icon: Trophy },
      ...(u.role === "admin"
        ? [{ path: "/users", name: "Equipe do estúdio", icon: Users }]
        : []),
      { path: "/settings", name: "Configurações", icon: Settings2 },
    ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#/" className="brand" aria-label="Camar Sports — início">
          <picture>
            <source media="(max-width: 900px)" srcSet="/assets/favicon.png" />
            <img src="/assets/logo-menu.png" alt="Camar Sports" width="652" height="148" />
          </picture>
        </a>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {items.map((item) => (
            <a
              key={item.path}
              className={
                (
                  item.path === "/"
                    ? path === "/" || parts[0] === "matches"
                    : path.startsWith(item.path)
                )
                  ? "active"
                  : ""
              }
              href={"#" + item.path}
            >
              <item.icon size={18} />
              {item.name}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <div>
              <strong>Cloud Overlays</strong>
              <small>Dados salvos na nuvem</small>
            </div>
            <Database size={16} />
          </div>
          <div className="profile">
            <div className="avatar">{u.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{u.name}</strong>
              <small>
                {u.role === "admin"
                  ? "Administrador"
                  : u.role === "operator"
                    ? "Operador"
                    : "Visualizador"}
              </small>
            </div>
            <button
              className="icon"
              title="Sair"
              onClick={async () => {
                await api("logout", "POST");
                setSession({ ...session, user: null });
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <span>
            Estúdio <ChevronRight size={13} />
            <b>
              {parts[0] === "matches"
                ? "Controle de partida"
                : parts[0] === "tournaments"
                  ? "Campeonatos"
                  : parts[0] === "users"
                    ? "Equipe"
                    : parts[0] === "settings"
                      ? "Configurações"
                      : "Visão geral"}
            </b>
          </span>
        </div>
        <main
          className={
            parts[0] === "tournaments" && parts[1]
              ? "workspace-main"
              : "main-content"
          }
        >
          {parts[0] === "matches" && parts[1] ? (
            <MatchControl key={parts[1]} matchId={parts[1]} user={u} />
          ) : parts[0] === "tournaments" && parts[1] ? (
            <TournamentEditor key={parts[1]} tournamentId={parts[1]} user={u} />
          ) : parts[0] === "users" && u.role === "admin" ? (
            <UsersPage user={u} />
          ) : parts[0] === "settings" ? (
            <SettingsPage user={u} />
          ) : (
            <Dashboard tournamentsOnly={parts[0] === "tournaments"} user={u} />
          )}
        </main>
        <footer className="app-footer">
          <Activity size={13} /> Feito para acompanhar o ritmo do jogo.
          <span>CAMAR SPORTS</span>
        </footer>
      </div>
    </div>
  );
}
