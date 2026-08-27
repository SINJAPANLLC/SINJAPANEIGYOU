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

export type AirtableSearchResult = {
  records: AirtableSearchRecord[];
  searchedTables: string[];
  error: string | null;
};

export type AirtableSearchOptions = {
  scopeKey?: string;
  commonTables?: string[];
  driverLookupKey?: string | null;
  driverLookupField?: string | null;
  driverSafeFields?: string[];
  driverTenantField?: string;
  driverTenantValue?: string;
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
    .filter((name) => Boolean(name) && !["全部", "全て", "すべて", "all", "*"].includes(name.toLowerCase()))
    .slice(0, MAX_TABLES)
    .map((name) => ({ id: name, name, fields: [] }));
}

function requestsAllTables() {
  return (process.env.AIRTABLE_TABLES || "")
    .split(/[\n,]/)
    .map((name) => name.trim().toLowerCase())
    .some((name) => ["全部", "全て", "すべて", "all", "*"].includes(name));
}

async function airtableJson<T>(url: string): Promise<T> {
  const { apiKey } = getConfig();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Airtableの読み取り権限がありません。トークンのdata.records:read権限と、対象Baseへのアクセスを確認してください。");
    }
    if (response.status === 404) {
      throw new Error("AirtableのBase IDまたはテーブル名を確認してください。");
    }
    throw new Error(`Airtable API ${response.status}で検索に失敗しました`);
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
    if (requestsAllTables()) {
      throw new Error("Airtableの全テーブル自動検出には、トークンへschema.bases:read権限を付与してください。");
    }
    tables = configuredTables();
    if (!tables.length) throw error;
  }
  tableCache = { baseId, tables, expiresAt: Date.now() + TABLE_CACHE_TTL_MS };
  return tables;
}

function escapeFormulaValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formulaFieldName(value: string) {
  return `{${value.replace(/\\/g, "\\\\").replace(/}/g, "\\}")}}`;
}

function searchTerms(input: string) {
  const normalized = input.trim().replace(/\s+/g, " ");
  const chunks = normalized.split(/[\s、。,.，、:：/／!?！？]+/).filter((term) => term.length >= 2);
  if (chunks.length) return chunks.slice(0, 8);
  return normalized.length >= 2 ? [normalized] : [];
}

function textFields(table: AirtableTable, allowedFields?: string[]) {
  const supported = new Set(["singleLineText", "multilineText", "email", "url", "phoneNumber", "singleSelect", "multipleSelects", "date", "dateTime"]);
  const allowed = allowedFields?.length ? new Set(allowedFields) : null;
  return table.fields.filter((field) => (!allowed || allowed.has(field.name)) && (!field.type || supported.has(field.type))).slice(0, 30);
}

function buildFilterFormula(table: AirtableTable, terms: string[], options: AirtableSearchOptions = {}, allowedFields?: string[]) {
  const fields = textFields(table, allowedFields);
  const queryExpressions = terms.flatMap((term) => fields.map((field) => `SEARCH("${escapeFormulaValue(term)}", CONCATENATE({${field.name}})) > 0`));
  const queryFormula = queryExpressions.length ? `OR(${queryExpressions.join(",")})` : "";
  const driverLookupFormula = options.driverLookupField && options.driverLookupKey
    ? `${formulaFieldName(options.driverLookupField)} = "${escapeFormulaValue(options.driverLookupKey)}"`
    : "";
  const tenantFormula = options.driverTenantField && options.driverTenantValue
    ? `${formulaFieldName(options.driverTenantField)} = "${escapeFormulaValue(options.driverTenantValue)}"`
    : "";
  const exactDriverFormula = driverLookupFormula && tenantFormula ? `AND(${driverLookupFormula}, ${tenantFormula})` : "";
  const legacyScopeExpressions = options.scopeKey
    ? fields.map((field) => `SEARCH("${escapeFormulaValue(options.scopeKey!)}", CONCATENATE({${field.name}})) > 0`)
    : [];
  const legacyScopeFormula = legacyScopeExpressions.length ? `OR(${legacyScopeExpressions.join(",")})` : "";
  const hasDriverScope = options.driverLookupKey !== undefined || options.driverLookupField !== undefined || options.driverSafeFields !== undefined;
  const scopeFormula = exactDriverFormula || (hasDriverScope ? "" : legacyScopeFormula);
  if (queryFormula && scopeFormula) return `AND(${queryFormula}, ${scopeFormula})`;
  return scopeFormula || queryFormula;
}

function fieldText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(", ");
  return JSON.stringify(value) || "";
}

function recordToSearchResult(table: AirtableTable, record: AirtableRecord, safeFields?: string[]): AirtableSearchRecord {
  const allowed = safeFields?.length ? new Set(safeFields) : null;
  const entries = Object.entries(record.fields)
    .filter(([key]) => !allowed || allowed.has(key))
    .map(([key, value]) => [key, fieldText(value)] as const)
    .filter(([, value]) => value);
  const safeFieldValues = Object.fromEntries(entries);
  const preferredTitle = ["会社名", "企業名", "案件名", "顧客名", "氏名", "名前", "Name", "name", "Title", "title"]
    .map((key) => safeFieldValues[key] || "")
    .find(Boolean);
  return {
    table: table.name,
    recordId: record.id,
    title: preferredTitle || `${table.name}のレコード`,
    content: entries.map(([key, value]) => `${key}: ${value}`).join("\n").slice(0, 1800),
    createdAt: record.createdTime || null,
  };
}

async function getMatchingRecords(table: AirtableTable, terms: string[], options: AirtableSearchOptions = {}, safeFields?: string[]) {
  const { baseId } = getConfig();
  const params = new URLSearchParams({ pageSize: String(MAX_RECORDS_PER_TABLE) });
  const formula = buildFilterFormula(table, terms, options, safeFields);
  if (formula) params.set("filterByFormula", formula);
  const data = await airtableJson<{ records?: AirtableRecord[] }>(
    `${AIRTABLE_API_ROOT}/${encodeURIComponent(baseId)}/${encodeURIComponent(table.id)}?${params.toString()}`,
  );
  return (data.records || [])
    .filter((record) => {
      if (options.driverLookupField && options.driverLookupKey && fieldText(record.fields[options.driverLookupField]) !== options.driverLookupKey) return false;
      if (options.driverTenantField && options.driverTenantValue && fieldText(record.fields[options.driverTenantField]) !== options.driverTenantValue) return false;
      return true;
    })
    .map((record) => recordToSearchResult(table, record, safeFields))
    .filter((record) => {
      const text = `${record.title}\n${record.content}`.toLocaleLowerCase("ja-JP");
      return terms.some((term) => text.includes(term.toLocaleLowerCase("ja-JP")))
        && (!options.scopeKey || text.includes(options.scopeKey.toLocaleLowerCase("ja-JP")));
    });
}

export async function searchAirtable(query: string, options: AirtableSearchOptions = {}): Promise<AirtableSearchResult> {
  const terms = searchTerms(query);
  if (!terms.length) return { records: [], searchedTables: [], error: null };
  try {
    const tables = await getTables();
    const records: AirtableSearchRecord[] = [];
    const driverMode = options.driverLookupKey !== undefined || options.driverLookupField !== undefined || options.driverSafeFields !== undefined;
    const privateDriverSearchAllowed = Boolean(options.driverLookupKey && options.driverLookupField && options.driverSafeFields?.length && options.driverTenantField && options.driverTenantValue);
    for (const table of tables.slice(0, MAX_TABLES)) {
      try {
        const isCommonTable = (options.commonTables || []).some((name) => name.trim() === table.name);
        if (driverMode && !isCommonTable && !privateDriverSearchAllowed) continue;
        records.push(...await getMatchingRecords(
          table,
          terms,
          isCommonTable ? {} : options,
          isCommonTable ? undefined : options.driverSafeFields,
        ));
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

export async function getAirtableStatus() {
  const { apiKey, baseId } = getConfig();
  const configured = Boolean(apiKey && baseId);
  if (!configured) {
    return {
      configured: false,
      connection: "not_configured" as const,
      baseConfigured: Boolean(baseId),
      manualTablesConfigured: configuredTables().length,
      tablesCached: false,
      error: null,
    };
  }
  try {
    const tables = await getTables();
    if (!tables.length) throw new Error("検索対象のAirtableテーブルが設定されていません。");
    await getMatchingRecords(tables[0], ["__sin_japan_connection_check__"]);
    return {
      configured: true,
      connection: "connected" as const,
      baseConfigured: Boolean(baseId),
      manualTablesConfigured: configuredTables().length,
      tablesCached: Boolean(tableCache && tableCache.baseId === baseId && tableCache.expiresAt > Date.now()),
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      connection: "error" as const,
      baseConfigured: Boolean(baseId),
      manualTablesConfigured: configuredTables().length,
      tablesCached: false,
      error: error instanceof Error ? error.message : "Airtable接続を確認できませんでした",
    };
  }
}