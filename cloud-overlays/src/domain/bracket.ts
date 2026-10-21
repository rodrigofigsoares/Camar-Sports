import type { Match, Stage, Tournament } from "./model";

export type BracketColumn = {
  title: string;
  matchIds: string[];
  lowerMatchIds?: string[];
  byes?: BracketBye[];
  entryIds?: string[];
};
export type BracketPage = { category: string; columns: BracketColumn[] };

// BYEs are presentation-only entries; they never create games or results.
export type BracketBye = {
  id: string;
  targetMatchId: string;
  targetStageId: string;
  slot: number;
};
export function bracketLayout(t: Tournament, columns: BracketColumn[]) {
  const width = 1360,
    cardHeight = 104;
  const height = Math.max(
    400,
    ...columns.map(
      (c) =>
        54 +
        (c.entryIds ?? c.matchIds).reduce(
          (sum, id) =>
            sum + (c.byes?.some((b) => b.id === id) ? 44 : cardHeight) + 8,
          0,
        ),
    ),
  );
  const step = width / Math.max(2, columns.length),
    cardWidth = step - 40;
  const nodes: {
    matchId: string;
    stageId: string;
    x: number;
    y: number;
    height: number;
    bye?: BracketBye;
  }[] = [];
  const byes = columns.flatMap((c) => c.byes ?? []);
  const links = [
    ...t.links,
    ...byes.map((b) => ({
      id: b.id,
      source: b.id,
      target: b.targetStageId,
      slot: b.slot,
      output: "winner",
    })),
  ];
  columns.forEach((column, ci) => {
    const ids = column.entryIds ?? column.matchIds;
    const heights = ids.map((id) =>
      byes.some((b) => b.id === id) ? 44 : cardHeight,
    );
    const gap = Math.max(
      8,
      (height - 60 - heights.reduce((sum, h) => sum + h, 0)) /
        Math.max(1, ids.length),
    );
    let cursor = 54;
    const placed = ids
      .map((matchId, i) => {
        const bye = byes.find((b) => b.id === matchId);
        const stageId =
          bye?.id ??
          t.stages.find((s) => s.matchIds.includes(matchId))?.id ??
          "";
        const parents = links
          .filter((l) => l.target === stageId)
          .flatMap((l) => nodes.filter((n) => n.stageId === l.source));
        const y = parents.length
          ? parents.reduce((sum, n) => sum + n.y + n.height / 2, 0) /
              parents.length -
            heights[i] / 2
          : cursor;
        cursor += heights[i] + gap;
        return { matchId, stageId, x: ci * step, y, height: heights[i], bye };
      })
      .sort((a, b) => a.y - b.y);
    placed.forEach(
      (n, i) =>
        (n.y = Math.max(
          54,
          n.y,
          i ? placed[i - 1].y + placed[i - 1].height + 8 : 54,
        )),
    );
    for (let i = placed.length - 1; i >= 0; i--)
      placed[i].y = Math.min(
        placed[i].y,
        i === placed.length - 1
          ? height - placed[i].height
          : placed[i + 1].y - placed[i].height - 8,
      );
    nodes.push(...placed);
  });
  const edges = links.flatMap((link) => {
    const from = nodes.find((n) => n.stageId === link.source),
      to = nodes.find((n) => n.stageId === link.target);
    if (!from || !to || from.x >= to.x) return [];
    const x1 = from.x + cardWidth,
      y1 = from.y + from.height / 2,
      x2 = to.x,
      y2 = to.y + (link.slot === 0 ? 46 : 79);
    return [
      {
        id: link.id,
        loser: link.output === "loser",
        path: `M ${x1} ${y1} H ${x2 - 20} V ${y2} H ${x2}`,
      },
    ];
  });
  return { width, height, cardWidth, cardHeight, step, nodes, edges };
}
export function inGroup(
  t: Tournament,
  groupId: string | null,
  selected: string[],
): boolean {
  const seen = new Set<string>();
  while (groupId && !seen.has(groupId)) {
    if (selected.includes(groupId)) return true;
    seen.add(groupId);
    groupId = t.groups.find((g) => g.id === groupId)?.parentId ?? null;
  }
  return false;
}

// v1 layout: round columns, up to five games per column and four columns per page.
export function bracketPages(
  t: Tournament,
  stages: Stage[],
  matches: Match[],
): BracketPage[] {
  stages = stages.filter((s) => s.kind === "knockout");
  const pages: BracketPage[] = [];
  const selected = new Set(stages.map((s) => s.id));
  const feeders = t.stages.filter(
    (s) =>
      s.kind === "knockout" &&
      !selected.has(s.id) &&
      t.links.some((l) => l.source === s.id && selected.has(l.target)),
  );
  const roundName = (s: Stage) => s.name.replace(/\s*\d+\s*$/, "").trim();
  const roundKey = (s: Stage) =>
    `${s.category}:${s.groupId ?? ""}:${roundName(s)}`;
  const depths = new Map<string, number>();
  function depth(id: string, seen = new Set<string>()): number {
    const stage = stages.find((s) => s.id === id);
    if (!stage) return 0;
    const key = roundKey(stage);
    if (depths.has(key)) return depths.get(key)!;
    if (seen.has(key)) return 0;
    const next = new Set(seen).add(key);
    const siblings = stages.filter((s) => roundKey(s) === key).map((s) => s.id);
    const outgoing = t.links.filter(
      (l) =>
        siblings.includes(l.source) &&
        selected.has(l.target) &&
        !siblings.includes(l.target),
    );
    const value = outgoing.length
      ? Math.max(...outgoing.map((l) => depth(l.target, next) + 1))
      : 0;
    depths.set(key, value);
    return value;
  }
  for (const category of [...new Set(stages.map((s) => s.category))]) {
    const columns = new Map<string, BracketColumn>();
    const ordered = stages
      .filter((s) => s.category === category)
      .sort(
        (a, b) =>
          depth(b.id) - depth(a.id) ||
          a.position.x - b.position.x ||
          a.position.y - b.position.y ||
          a.name.localeCompare(b.name, "pt-BR", { numeric: true }) ||
          t.groups.findIndex((g) => g.id === a.groupId) -
            t.groups.findIndex((g) => g.id === b.groupId) ||
          a.id.localeCompare(b.id),
      );
    for (const s of ordered) {
      const group = t.groups.find((g) => g.id === s.groupId);
      const key = `${group?.id ?? "ungrouped"}:${depth(s.id)}`;
      let column = columns.get(key);
      if (!column) {
        const multipleRounds = stages.some(
          (other) =>
            other.groupId === s.groupId && depth(other.id) !== depth(s.id),
        );
        column = {
          title: multipleRounds ? roundName(s) : (group?.name ?? roundName(s)),
          matchIds: [],
          lowerMatchIds: [],
        };
        columns.set(key, column);
      }
      column.matchIds.push(
        ...s.matchIds.filter((id) => matches.some((m) => m.id === id)),
      );
    }
    const all = [...columns.values()].filter((c) => c.matchIds.length);
    const lanes = new Map<string, BracketColumn[]>();
    for (const column of all) {
      const stage = stages.find((s) => s.matchIds.includes(column.matchIds[0]));
      const groupId = stage?.groupId;
      const key = groupId ?? "ungrouped";
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key)!.push(column);
    }
    for (const lane of [...lanes.values()].sort((a, b) => b.length - a.length))
      for (let start = 0; start < lane.length; start += 4) {
        const batch = lane.slice(start, start + 4);
        const count = Math.max(
          ...batch.map((c) => Math.ceil(c.matchIds.length / 5)),
        );
        for (let page = 0; page < count; page++)
          pages.push({
            category,
            columns: batch
              .map((c) => ({
                ...c,
                // Keep the later rounds visible while paging a larger opening round.
                matchIds:
                  c.matchIds.length <= 5
                    ? c.matchIds
                    : c.matchIds.slice(page * 5, page * 5 + 5),
              }))
              .filter((c) => c.matchIds.length),
          });
      }
    const feederGroups = new Map<string, BracketColumn>();
    for (const feeder of feeders.filter((s) => s.category === category)) {
      const key = feeder.groupId ?? roundName(feeder);
      if (!feederGroups.has(key))
        feederGroups.set(key, {
          title:
            t.groups.find((g) => g.id === feeder.groupId)?.name ??
            roundName(feeder),
          matchIds: [],
        });
      feederGroups
        .get(key)!
        .matchIds.push(
          ...feeder.matchIds.filter((id) => matches.some((m) => m.id === id)),
        );
    }
    for (const column of feederGroups.values())
      for (let i = 0; i < column.matchIds.length; i += 5) {
        pages.push({
          category,
          columns: [{ ...column, matchIds: column.matchIds.slice(i, i + 5) }],
        });
      }
  }
  return pages;
}
