export type ColumnType = "string" | "number" | "boolean" | "datetime" | "json";

export interface TableColumn {
  name: string;
  type: ColumnType;
  selected: boolean;
}

export interface TableNodeData {
  pluginName: string;
  tableName: string;
  alias: string;
  columns: TableColumn[];
  keyColumns: string[];
  primaryKey: string[];
  [key: string]: unknown;
}

export type JoinType = "INNER" | "LEFT" | "RIGHT" | "FULL";

export interface JoinEdgeData {
  joinType: JoinType;
  sourceColumn: string;
  targetColumn: string;
  [key: string]: unknown;
}

export interface WhereRule {
  field: string;
  operator: string;
  value: string;
}

export interface WhereGroup {
  combinator: "and" | "or";
  rules: Array<WhereRule | WhereGroup>;
}

export interface QueryGraph {
  tables: Array<{
    nodeId: string;
    pluginName: string;
    tableName: string;
    alias: string;
    columns: TableColumn[];
  }>;
  joins: Array<{
    fromNodeId: string;
    fromColumn: string;
    toNodeId: string;
    toColumn: string;
    joinType: JoinType;
  }>;
  where: WhereGroup | null;
  orderBy: Array<{ column: string; direction: "ASC" | "DESC" }> | null;
  limit: number | null;
}
