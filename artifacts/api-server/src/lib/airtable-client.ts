const AIRTABLE_API_ROOT = "https://api.airtable.com/v0";
const AIRTABLE_META_ROOT = "https://api.airtable.com/v0/meta";
const TABLE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TABLES = 20;
const MAX_RECORDS_PER_TABLE = 30;

type AirtableField = { id: string; name: string; type?: string };
type AirtableTable = { id: string; name: string; fields: AirtableField[] };
type AirtableRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };

export type AirtableSearchRecord = {
  table: string;
  recordId: string;
  title: string;
  content: string;
  createdAt: string | null;
};

type AirtableSearchResult = {
  records: AirtableSearchRecord[];
  searchedTables: string[];
  error: string | null;
};

let tableCache: { baseId: string; tables: AirtableTable[]; expiresAt: number } | null = null;

function getConfig() {
  const rawBaseId = process.env.AIRTABLE_BASE_ID?.trim() || "";
  const baseId = rawBaseId.match(/\bapp[a-zA-Z0-9]+\b/)?.[0] || rawBaseId;
  return {
    apiKey: process.env.AIRTABLE_API_KEY?.trim() || "",
    baseId,
  };
}

function configuredTables() {
  return (process.env.AIRTABLE_TABLES || "")
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, MAX_TABLES)
    .map((name) => ({ id: name, name, fields: [] }));
}

async function airtableJson<T>(url: string): Promise<T> {
  const { apiKey } = getConfig();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Airtable API ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return response.json() as Promise<T>;
}

async function getTables(): Promise<AirtableTable[]> {
  const { apiKey, baseId } = getConfig();
  if (!apiKey || !baseId) throw new Error("AirtableのAPIキーまたはBase IDが未設定です");
  if (tableCache && tableCache.baseId === baseId && tableCache.expiresAt > Date.now()) return tableCache.tables;

  let tables: AirtableTable[];
  try {
    const data = await airtableJson<{ tables?: AirtableTable[] }>(`${AIRTABLE_META_ROOT}/bases/${encodeURIComponent(baseId)}/tables`);
    tables = (data.tables || []).filter((table) => table.id && table.name);
  } catch (error) {
    tables = configuredTables();
    if (!tables.length) throw error;
  }
  tableCache = { baseId, tables, expiresAt: Date.now() + TABLE_CACHE_TTL_MS };
  return tables;
}

function escapeFormulaValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function searchTerms(input: string) {
  const normalized = input.trim().replace(/\s+/g, " ");
  const chunks = normalized.split(/[\s、。,.，、:：/／!?！？]+/).filter((term) => term.length >= 2);
  if (chunks.length) return chunks.slice(0, 8);
  return normalized.length >= 2 ? [normalized] : [];
}

function textFields(table: AirtableTable) {
  const supported = new Set(["singleLineText", "multilineText", "email", "url", "phoneNumber", "singleSelect", "multipleSelects", "date", "dateTime"]);
  return table.fields.filter((field) => !field.type || supported.has(field.type)).slice(0, 30);
}

function buildFilterFormula(table: AirtableTable, terms: string[]) {
  const fields = textFields(table);
  if (!fields.length || !terms.length) return "";
  const expressions = terms.flatMap((term) => fields.map((field) => `SEARCH("${escapeFormulaValue(term)}", CONCATENATE({${field.name}})) > 0`));
  return expressions.length ? `OR(${expressions.join(",")})` : "";
}

function fieldText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(", ");
  return JSON.stringify(value) || "";
}

function recordToSearchResult(table: AirtableTable, record: AirtableRecord): AirtableSearchRecord {
  const entries = Object.entries(record.fields)
    .map(([key, value]) => [key, fieldText(value)] as const)
    .filter(([, value]) => value);
  const preferredTitle = ["会社名", "企業名", "案件名", "顧客名", "氏名", "名前", "Name", "name", "Title", "title"]
    .map((key) => fieldText(record.fields[key]))
    .find(Boolean);
  return {
    table: table.name,
    recordId: record.id,
    title: preferredTitle || `${table.name}のレコード`,
    content: entries.map(([key, value]) => `${key}: ${value}`).join("\n").slice(0, 1800),
    createdAt: record.createdTime || null,
  };
}

async function getMatchingRecords(table: AirtableTable, terms: string[]) {
  const { baseId } = getConfig();
  const params = new URLSearchParams({ pageSize: String(MAX_RECORDS_PER_TABLE) });
  const formula = buildFilterFormula(table, terms);
  if (formula) params.set("filterByFormula", formula);
  const data = await airtableJson<{ records?: AirtableRecord[] }>(
    `${AIRTABLE_API_ROOT}/${encodeURIComponent(baseId)}/${encodeURIComponent(table.id)}?${params.toString()}`,
  );
  return (data.records || [])
    .map((record) => recordToSearchResult(table, record))
    .filter((record) => terms.some((term) => `${record.title}\n${record.content}`.toLocaleLowerCase("ja-JP").includes(term.toLocaleLowerCase("ja-JP"))));
}

export async function searchAirtable(query: string): Promise<AirtableSearchResult> {
  const terms = searchTerms(query);
  if (!terms.length) return { records: [], searchedTables: [], error: null };
  try {
    const tables = await getTables();
    const records: AirtableSearchRecord[] = [];
    for (const table of tables.slice(0, MAX_TABLES)) {
      try {
        records.push(...await getMatchingRecords(table, terms));
      } catch {
        // One table with restricted fields should not hide results from other tables.
      }
    }
    return { records: records.slice(0, 30), searchedTables: tables.slice(0, MAX_TABLES).map((table) => table.name), error: null };
  } catch (error) {
    return {
      records: [],
      searchedTables: [],
      error: error instanceof Error ? error.message : "Airtableの検索に失敗しました",
    };
  }
}

export function getAirtableStatus() {
  const { apiKey, baseId } = getConfig();
  return {
    configured: Boolean(apiKey && baseId),
    baseConfigured: Boolean(baseId),
    manualTablesConfigured: configuredTables().length,
    tablesCached: Boolean(tableCache && tableCache.baseId === baseId && tableCache.expiresAt > Date.now()),
  };
}