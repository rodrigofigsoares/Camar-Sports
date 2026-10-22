import Papa from "papaparse";
import {
  createMatch,
  team,
  type Match,
  type Tournament,
  type Sport,
  type Team,
  type Stage,
} from "./model";
import { newStage } from "./tournament";
import { result } from "./scoring";
const setSport = (sport: Sport) =>
  ["tennis", "beachtennis", "volleyball", "beachhandball"].includes(sport);
const setColumns = (
  sport: Sport,
  length = ["volleyball", "tennis"].includes(sport) ? 5 : 3,
) =>
  setSport(sport)
    ? Array.from({ length }, (_, i) => [
        `Set ${i + 1} A`,
        `Set ${i + 1} B`,
      ]).flat()
    : [];
export function csvColumns(sport: Sport, length?: number) {
  return [
    "Tipo",
    "ID Partida",
    "Campeonato",
    "Organizador",
    "Categoria",
    "Fase",
    "Tipo de fase",
    "Time A Oficial",
    "Time A Exibição",
    "Cor A",
    "Placar A",
    "Time B Oficial",
    "Time B Exibição",
    "Cor B",
    "Placar B",
    "Data",
    "Horário",
    "Local",
    "Status",
    ...setColumns(sport, length),
  ];
}
export function csvTemplate(t: Tournament) {
  return (
    "\uFEFF" +
    Papa.unparse(
      { fields: csvColumns(t.sport), data: [] },
      { delimiter: ";" },
    ) +
    "\r\n"
  );
}
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const isPending = (name: string) => normalize(name) === "adefinir";
const matchKey = (a: string, b: string, date: string, stageId: string) =>
  [normalize(a), normalize(b), date, stageId].join("|");
export function importCsv(text: string, source: Tournament, existing: Match[]) {
  const clean = text.replace(/^\uFEFF/, "").trimStart();
  const separator = /^sep=([;,\t])\r?\n/i.exec(clean);
  const parsed = Papa.parse<Record<string, string>>(
    separator ? clean.slice(separator[0].length) : clean,
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: normalize,
      ...(separator ? { delimiter: separator[1] } : {}),
    },
  );
  if (parsed.errors.length)
    throw new Error("CSV inválido: " + parsed.errors[0].message);
  if (
    !["a", "b"].every((side) =>
      parsed.meta.fields?.some((k) =>
        [
          `time${side}oficial`,
          `time${side}`,
          `equipe${side}`,
          `team${side}`,
        ].includes(k),
      ),
    )
  )
    throw new Error(
      "Inclua as colunas Time A Oficial e Time B Oficial no CSV.",
    );
  const t = structuredClone(source),
    matches: Match[] = [],
    updates: Match[] = [],
    existingCounts = new Map<string, number>(),
    occurrences = new Map<string, number>(),
    seen = new Set<string>();
  for (const m of existing) {
    const key = matchKey(
      m.a.team.name,
      m.b.team.name,
      m.scheduledAt,
      m.stageId ?? "",
    );
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
    seen.add(key);
  }
  let skipped = 0;
  const get = (r: Record<string, string>, ...keys: string[]) =>
    keys
      .map((k) => r[normalize(k)])
      .find((v) => v?.trim())
      ?.trim() ?? "";
  for (const [index, row] of parsed.data.entries()) {
    const nameA = get(row, "Time A Oficial", "Time A", "Equipe A", "Team A"),
      nameB = get(row, "Time B Oficial", "Time B", "Equipe B", "Team B");
    if (!nameA) throw new Error(`Linha ${index + 2}: informe a equipe A.`);
    const getTeam = (
      name: string,
      display: string,
      color: string,
      i: number,
    ): Team | null => {
      if (isPending(name)) return null;
      let found = t.teams.find((x) => normalize(x.name) === normalize(name));
      if (!found) {
        found = team(name, i);
        if (display) found.shortName = display.slice(0, 24);
        if (/^#[0-9a-f]{6}$/i.test(color)) found.color = color;
        t.teams.push(found);
      }
      return found;
    };
    const a = getTeam(
      nameA,
      get(row, "Time A Exibição"),
      get(row, "Cor A", "Time A Cor"),
      0,
    );
    if (normalize(get(row, "Tipo")) === "equipe") {
      skipped++;
      continue;
    }
    if (!nameB) throw new Error(`Linha ${index + 2}: informe a equipe B.`);
    const b = getTeam(
      nameB,
      get(row, "Time B Exibição"),
      get(row, "Cor B", "Time B Cor"),
      1,
    );
    if (a && b && a.id === b.id)
      throw new Error(
        `Linha ${index + 2}: uma equipe não pode jogar contra si mesma.`,
      );
    const category = get(row, "Categoria") || "Principal",
      phaseName = get(row, "Fase") || "Importação",
      group = get(row, "Grupo/Chave", "Grupo");
    if (!t.categories.includes(category)) t.categories.push(category);
    const name = group ? `${phaseName} · ${group}` : phaseName;
    const kindValue = normalize(get(row, "Tipo de fase", "Formato da fase"));
    const kinds: Record<string, Stage["kind"]> = {
      group: "group",
      grupo: "group",
      grupos: "group",
      fasedegrupos: "group",
      league: "league",
      liga: "league",
      pontoscorridos: "league",
      knockout: "knockout",
      eliminatoria: "knockout",
      eliminatorio: "knockout",
      confrontoeliminatorio: "knockout",
      matamata: "knockout",
      swiss: "swiss",
      suico: "swiss",
    };
    if (kindValue && !kinds[kindValue])
      throw new Error(
        `Linha ${index + 2}: tipo de fase inválido. Use Grupo, Liga, Eliminatória ou Suíço.`,
      );
    let stage = t.stages.find(
      (s) => s.name === name && s.category === category,
    );
    if (!stage) {
      stage = newStage(
        name,
        kinds[kindValue] ?? "group",
        [],
        category,
        t.stages.length,
      );
      stage.advance = 2;
      t.stages.push(stage);
    }
    if (kindValue && stage.kind !== kinds[kindValue])
      throw new Error(
        `Linha ${index + 2}: o tipo informado difere da fase existente. Altere-o em Configurar fase antes de importar.`,
      );
    const date = get(row, "Data"),
      hour = get(row, "Horário", "Hora") || "00:00";
    let scheduledAt = "";
    if (date) {
      const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
      const iso = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : date;
      scheduledAt = `${iso}T${hour}`;
      if (Number.isNaN(Date.parse(scheduledAt)))
        throw new Error(`Linha ${index + 2}: data ou horário inválido.`);
    }
    const key = matchKey(nameA, nameB, scheduledAt, stage.id);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    const explicitId = get(row, "ID Partida");
    const candidates = existing.filter(
      (m) =>
        m.stageId === stage.id &&
        normalize(m.a.team.name) === normalize(nameA) &&
        normalize(m.b.team.name) === normalize(nameB) &&
        (!scheduledAt || m.scheduledAt === scheduledAt),
    );
    const current = explicitId
      ? existing.find((m) => m.id === explicitId)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    if (
      current &&
      (current.stageId !== stage.id ||
        normalize(current.a.team.name) !== normalize(nameA) ||
        normalize(current.b.team.name) !== normalize(nameB))
    )
      throw new Error(
        `Linha ${index + 2}: ID da partida não corresponde à fase e às equipes.`,
      );
    const hasResult =
      get(row, "Placar A", "Score A", "Sets A", "Gols A", "Pontos A") !== "" &&
      get(row, "Placar B", "Score B", "Sets B", "Gols B", "Pontos B") !== "";
    if (!explicitId && candidates.length > 1 && hasResult)
      throw new Error(
        `Linha ${index + 2}: mais de uma partida corresponde ao resultado. Use ID Partida ou informe a data e o horário.`,
      );
    if (
      !current &&
      (a && b ? seen.has(key) : occurrence <= (existingCounts.get(key) ?? 0))
    ) {
      skipped++;
      continue;
    }
    seen.add(key);
    // Each unknown participant is an independent vacancy, not a shared team.
    const slot = (participant: Team | null) => {
      if (participant && stage.seeds.includes(participant.id))
        return stage.seeds.indexOf(participant.id);
      const index = stage.seeds.length;
      stage.seeds.push(participant?.id ?? null);
      return index;
    };
    if (current && !hasResult) {
      skipped++;
      continue;
    }
    const slotA = current?.slotA ?? slot(a),
      slotB = current?.slotB ?? slot(b);
    if (
      stage.kind === "knockout" &&
      (stage.seeds.length !== 2 || (!current && stage.matchIds.length))
    )
      throw new Error(
        `Linha ${index + 2}: cada fase eliminatória deve conter um confronto de duas vagas. Use nomes de fase distintos para cada confronto.`,
      );
    const pendingTeam = (index: number): Team => ({
      id: `pending-${stage.id}-${index}`,
      name: "A definir",
      shortName: "A definir",
      color: "#333333",
      textColor: "#ffffff",
    });
    const score = (value: string) => {
      if (!value) return 0;
      if (!/^\d+$/.test(value) || Number(value) > 9999)
        throw new Error(`Linha ${index + 2}: placar inválido.`);
      return Number(value);
    };
    const sa = get(
        row,
        "Placar A",
        "Score A",
        ...(setSport(t.sport) ? ["Sets A"] : ["Gols A", "Pontos A"]),
      ),
      sb = get(
        row,
        "Placar B",
        "Score B",
        ...(setSport(t.sport) ? ["Sets B"] : ["Gols B", "Pontos B"]),
      );
    if ((sa === "") !== (sb === ""))
      throw new Error(
        `Linha ${index + 2}: preencha os dois placares ou deixe ambos em branco.`,
      );
    const m = current
      ? structuredClone(current)
      : createMatch(t.sport, a ?? pendingTeam(slotA), b ?? pendingTeam(slotB));
    m.tournamentId = t.id;
    m.stageId = stage.id;
    m.slotA = slotA;
    m.slotB = slotB;
    m.category = category;
    m.scheduledAt = scheduledAt;
    m.venue = get(row, "Local");
    const sets = setSport(t.sport);
    m.a[sets ? "sets" : "score"] = score(sa);
    m.b[sets ? "sets" : "score"] = score(sb);
    const status = normalize(get(row, "Status"));
    m.status = ["aovivo", "live", "emandamento"].includes(status)
      ? "live"
      : [
            "encerrado",
            "encerrada",
            "finalizado",
            "finalizada",
            "finished",
            "done",
            "concluido",
          ].includes(status) ||
          (sa !== "" &&
            sb !== "" &&
            !["agendado", "agendada", "scheduled"].includes(status))
        ? "done"
        : "scheduled";
    if (sets && parsed.meta.fields?.some((k) => /^set\d+[ab]$/.test(k)))
      m.setHistory = [];
    for (let n = 1; sets && n <= 5; n++) {
      const x = get(row, `Set ${n} A`, `Set${n}A`),
        y = get(row, `Set ${n} B`, `Set${n}B`);
      if ((x === "") !== (y === ""))
        throw new Error(
          `Linha ${index + 2}: preencha os dois placares do set ${n}.`,
        );
      if (x || y) m.setHistory.push({ a: score(x), b: score(y) });
    }
    if (sets && !sa && !sb && m.setHistory.length) {
      m.a.sets = m.setHistory.filter((s) => s.a > s.b).length;
      m.b.sets = m.setHistory.filter((s) => s.b > s.a).length;
    }
    if (
      (!a || !b) &&
      (m.status !== "scheduled" ||
        score(sa) > 0 ||
        score(sb) > 0 ||
        m.setHistory.length)
    )
      throw new Error(
        `Linha ${index + 2}: uma partida com equipe A definir deve estar agendada e sem resultado.`,
      );
    if (current) {
      if (m.status === "scheduled" && a && b && hasResult) m.status = "done";
      const same =
        current.status === m.status &&
        result(current, "a") === result(m, "a") &&
        result(current, "b") === result(m, "b") &&
        JSON.stringify(current.setHistory) === JSON.stringify(m.setHistory);
      if (same) skipped++;
      else if (updates.some((x) => x.id === m.id))
        throw new Error(
          `Linha ${index + 2}: resultado repetido para a mesma partida.`,
        );
      else updates.push(m);
    } else {
      stage.matchIds.push(m.id);
      matches.push(m);
    }
  }
  return { tournament: t, matches, updates, skipped };
}
export function exportCsv(t: Tournament, matches: Match[]) {
  const setCount = setSport(t.sport)
    ? Math.max(
        ["volleyball", "tennis"].includes(t.sport) ? 5 : 3,
        ...matches
          .filter((m) => m.tournamentId === t.id)
          .map((m) => m.setHistory.length),
      )
    : 0;
  const fields = csvColumns(t.sport, setCount);
  return (
    "\uFEFF" +
    Papa.unparse(
      {
        fields,
        data: matches
          .filter((m) => m.tournamentId === t.id)
          .map((m) => ({
            Tipo: "Partida",
            "ID Partida": m.id,
            Campeonato: t.name,
            Organizador: t.organizer,
            Categoria: m.category,
            Fase: t.stages.find((s) => s.id === m.stageId)?.name ?? "",
            "Tipo de fase":
              t.stages.find((s) => s.id === m.stageId)?.kind ?? "group",
            "Time A Oficial": m.a.team.name,
            "Time A Exibição": m.a.team.shortName,
            "Cor A": m.a.team.color,
            "Placar A": m.status === "scheduled" ? "" : result(m, "a"),
            "Time B Oficial": m.b.team.name,
            "Time B Exibição": m.b.team.shortName,
            "Cor B": m.b.team.color,
            "Placar B": m.status === "scheduled" ? "" : result(m, "b"),
            Data: m.scheduledAt.slice(0, 10),
            Horário: m.scheduledAt.slice(11, 16),
            Local: m.venue,
            Status: m.status,
            ...Object.fromEntries(
              Array.from(
                {
                  length: setCount,
                },
                (_, i) => [
                  [`Set ${i + 1} A`, m.setHistory[i]?.a ?? ""],
                  [`Set ${i + 1} B`, m.setHistory[i]?.b ?? ""],
                ],
              ).flat(),
            ),
          })),
      },
      { delimiter: ";" },
    )
  );
}
