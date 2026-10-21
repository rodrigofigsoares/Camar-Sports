/** Normalize team text throughout API snapshots, including legacy records. */
export function uppercaseTeams<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => uppercaseTeams(item)) as T;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const isTeam = typeof record.id === "string" && typeof record.name === "string" &&
    typeof record.shortName === "string" && typeof record.color === "string" &&
    typeof record.textColor === "string";
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key,
    isTeam && ["name", "shortName", "cheer"].includes(key) && typeof item === "string"
      ? item.toLocaleUpperCase("pt-BR") : uppercaseTeams(item),
  ])) as T;
}
