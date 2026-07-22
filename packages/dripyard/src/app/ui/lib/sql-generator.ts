import type {
  QueryGraph,
  WhereGroup,
  WhereRule,
} from "@/components/visual-query/types";

/**
 * Convert a visual query graph into a DuckDB-compatible SQL string.
 *
 * The graph is a flat list of tables, a list of joins (referencing node
 * ids), an optional nested WHERE tree, optional ORDER BY, and a LIMIT.
 * Aliases are resolved from the table list so every column reference is
 * fully qualified (`alias.column`).
 */
export function generateSql(graph: QueryGraph): string {
  const { tables, joins, where, orderBy, limit } = graph;

  if (!tables || tables.length === 0) {
    return "-- No tables selected";
  }

  const aliasByNodeId = new Map<string, string>();
  const tableByNodeId = new Map<string, (typeof tables)[number]>();
  for (const t of tables) {
    aliasByNodeId.set(t.nodeId, t.alias);
    tableByNodeId.set(t.nodeId, t);
  }

  // SELECT — only selected columns, alias-prefixed. Fall back to *.
  const selectCols: string[] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.selected) selectCols.push(`${t.alias}.${c.name}`);
    }
  }
  const selectClause = selectCols.length > 0 ? selectCols.join(", ") : "*";

  // FROM — first table with its alias.
  const first = tables[0];
  const lines: string[] = [`SELECT ${selectClause}`, `FROM ${first.tableName} ${first.alias}`];

  // JOINs — resolve node ids to aliases + table names.
  for (const j of joins) {
    const fromAlias = aliasByNodeId.get(j.fromNodeId);
    const toTable = tableByNodeId.get(j.toNodeId);
    const toAlias = aliasByNodeId.get(j.toNodeId);
    if (!fromAlias || !toTable || !toAlias) continue;
    lines.push(
      `${j.joinType} JOIN ${toTable.tableName} ${toAlias} ON ${fromAlias}.${j.fromColumn} = ${toAlias}.${j.toColumn}`,
    );
  }

  // WHERE — recursively flatten the group tree.
  const whereSql = where ? whereGroupToSql(where) : null;
  if (whereSql) lines.push(`WHERE ${whereSql}`);

  // ORDER BY — alias-qualify bare column names.
  if (orderBy && orderBy.length > 0) {
    const parts = orderBy.map((o) => `${resolveOrderByColumn(o.column, tables)} ${o.direction}`);
    lines.push(`ORDER BY ${parts.join(", ")}`);
  }

  if (limit != null && Number.isFinite(limit)) {
    lines.push(`LIMIT ${limit}`);
  }

  return lines.join("\n");
}

function whereGroupToSql(group: WhereGroup): string | null {
  const parts: string[] = [];
  for (const rule of group.rules) {
    const sql = isGroup(rule) ? whereGroupToSql(rule) : formatRule(rule);
    if (sql) parts.push(sql);
  }
  if (parts.length === 0) return null;
  const combinator = group.combinator === "or" ? "OR" : "AND";
  return `(${parts.join(` ${combinator} `)})`;
}

function isGroup(rule: WhereRule | WhereGroup): rule is WhereGroup {
  return typeof (rule as WhereGroup).rules === "object" && Array.isArray((rule as WhereGroup).rules);
}

function formatRule(rule: WhereRule): string | null {
  const field = rule.field?.trim();
  if (!field) return null;
  const op = rule.operator;
  const val = rule.value ?? "";

  switch (op) {
    case "null":
      return `${field} IS NULL`;
    case "notNull":
      return `${field} IS NOT NULL`;
    case "in":
    case "notIn": {
      const items = splitList(val).map(formatScalar);
      if (items.length === 0) return null;
      return `${field} ${op === "in" ? "IN" : "NOT IN"} (${items.join(", ")})`;
    }
    case "between":
    case "notBetween": {
      const items = splitList(val);
      if (items.length < 2) return null;
      return `${field} ${op === "between" ? "BETWEEN" : "NOT BETWEEN"} ${formatScalar(items[0])} AND ${formatScalar(items[1])}`;
    }
    case "contains":
      return `${field} LIKE ${quoteString(`%${val}%`)}`;
    case "doesNotContain":
      return `${field} NOT LIKE ${quoteString(`%${val}%`)}`;
    case "beginsWith":
      return `${field} LIKE ${quoteString(`${val}%`)}`;
    case "doesNotBeginWith":
      return `${field} NOT LIKE ${quoteString(`${val}%`)}`;
    case "endsWith":
      return `${field} LIKE ${quoteString(`%${val}`)}`;
    case "doesNotEndWith":
      return `${field} NOT LIKE ${quoteString(`%${val}`)}`;
    default:
      return `${field} ${op} ${formatScalar(val)}`;
  }
}

/** Format a single scalar value: numbers stay bare, everything else is quoted. */
function formatScalar(val: string): string {
  const trimmed = val.trim();
  if (isNumeric(trimmed)) return trimmed;
  return quoteString(trimmed);
}

function quoteString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function isNumeric(s: string): boolean {
  if (s === "") return false;
  const n = Number(s);
  return !Number.isNaN(n) && Number.isFinite(n);
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/** Qualify a bare column name with its owning table's alias when possible. */
function resolveOrderByColumn(
  column: string,
  tables: QueryGraph["tables"],
): string {
  if (column.includes(".")) return column;
  for (const t of tables) {
    if (t.columns.some((c) => c.name === column)) {
      return `${t.alias}.${column}`;
    }
  }
  return `${tables[0].alias}.${column}`;
}
