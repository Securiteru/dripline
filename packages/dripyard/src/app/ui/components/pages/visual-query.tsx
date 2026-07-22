import { Play } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { RuleGroupType } from "react-querybuilder";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useSubscription } from "@/hooks/use-subscription";
import { mutate } from "@/lib/api";
import { generateSql } from "@/lib/sql-generator";
import type {
  JoinEdgeData,
  QueryGraph,
  TableColumn,
  TableNodeData,
  WhereGroup,
  WhereRule,
} from "@/components/visual-query/types";
import { Canvas } from "@/components/visual-query/canvas";
import { ResultsPanel } from "@/components/visual-query/results-panel";
import { TableSidebar } from "@/components/visual-query/table-sidebar";
import { WhereBuilder } from "@/components/visual-query/where-builder";

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  attached: string[];
};

type Plugin = {
  name: string;
  tableCount: number;
  tables: Array<{ name: string }>;
};

export function VisualQueryPage() {
  const plugins = useSubscription<Plugin[]>("workspace.plugins") ?? [];

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<JoinEdgeData>>([]);

  const [whereRules, setWhereRules] = useState<RuleGroupType>({
    combinator: "and",
    rules: [],
  });

  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleTableDrop = useCallback(
    (pluginName: string, tableName: string, columns: TableColumn[]) => {
      setNodes((nds) => {
        const existing = new Set(nds.map((n) => n.data.alias));
        const alias = generateAlias(tableName, existing);
        const newNode: Node<TableNodeData> = {
          id: `${tableName}-${nds.length}-${Date.now()}`,
          type: "table",
          position: {
            x: 80 + nds.length * 48,
            y: 60 + nds.length * 48,
          },
          data: {
            pluginName,
            tableName,
            alias,
            columns: columns.map((c) => ({ ...c, selected: true })),
            keyColumns: [],
            primaryKey: [],
          },
        };
        return [...nds, newNode];
      });
    },
    [setNodes],
  );

  const handleColumnToggle = useCallback(
    (nodeId: string, columnName: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  columns: n.data.columns.map((c) =>
                    c.name === columnName ? { ...c, selected: !c.selected } : c,
                  ),
                },
              }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge<JoinEdgeData> = {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        data: {
          joinType: "INNER",
          sourceColumn: connection.sourceHandle ?? "",
          targetColumn: connection.targetHandle ?? "",
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges],
  );

  // Flatten the selected nodes' columns into alias-qualified fields for
  // the WHERE builder so every rule references a fully-qualified column.
  const fields = useMemo(
    () =>
      nodes.flatMap((n) =>
        n.data.columns.map((c) => ({
          name: `${n.data.alias}.${c.name}`,
          label: `${n.data.alias}.${c.name}`,
          type: c.type,
        })),
      ),
    [nodes],
  );

  const graph = useMemo<QueryGraph>(
    () => ({
      tables: nodes.map((n) => ({
        nodeId: n.id,
        pluginName: n.data.pluginName,
        tableName: n.data.tableName,
        alias: n.data.alias,
        columns: n.data.columns,
      })),
      joins: edges.map((e) => ({
        fromNodeId: e.source,
        fromColumn: e.data?.sourceColumn ?? "",
        toNodeId: e.target,
        toColumn: e.data?.targetColumn ?? "",
        joinType: e.data?.joinType ?? "INNER",
      })),
      where: whereRules.rules.length > 0 ? ruleGroupToWhereGroup(whereRules) : null,
      orderBy: null,
      limit: null,
    }),
    [nodes, edges, whereRules],
  );

  const sql = useMemo(() => generateSql(graph), [graph]);

  const runQuery = useCallback(async () => {
    if (!sql.trim() || sql.startsWith("--")) return;
    setRunning(true);
    setError(null);
    try {
      const r = await mutate<QueryResult>("workspace.runSql", { sql });
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Query failed");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [sql]);

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          void runQuery();
        }
      }}
    >
      <PageHeader
        title="Visual Query"
        description={`${plugins.length} plugins · ${nodes.length} table${nodes.length === 1 ? "" : "s"} on canvas`}
        actions={
          <Button onClick={() => void runQuery()} disabled={running} size="sm">
            <Play className="size-3.5 mr-1" />
            {running ? "Running…" : "Run"}
          </Button>
        }
      />

      <div className="flex flex-1 min-h-0 gap-3 px-4 pb-4 min-w-0">
        {/* Left — table palette */}
        <div className="w-[260px] flex-none min-h-0 overflow-auto border border-[var(--border-muted)] rounded bg-[var(--panel)]/40">
          <TableSidebar onTableDrop={handleTableDrop} />
        </div>

        {/* Center — canvas + live SQL preview */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0 border border-[var(--border-muted)] rounded overflow-hidden">
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onColumnToggle={handleColumnToggle}
            />
          </div>
          <textarea
            readOnly
            value={sql}
            spellCheck={false}
            className="font-mono text-xs bg-[var(--panel)]/40 border border-[var(--border-muted)] rounded p-2 h-[80px] flex-none resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30"
          />
        </div>

        {/* Right — WHERE builder + results */}
        <div className="w-[350px] flex-none flex flex-col gap-3 min-h-0">
          <WhereBuilder
            fields={fields}
            value={whereRules}
            onChange={setWhereRules}
          />
          <div className="flex-1 min-h-0">
            <ResultsPanel result={result} error={error} loading={running} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Generate a unique alias for a table: first letter, then m2, m3, … */
function generateAlias(tableName: string, existing: Set<string>): string {
  const base = (tableName[0] ?? "t").toLowerCase();
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/** Convert a react-querybuilder RuleGroupType into the simpler WhereGroup. */
function ruleGroupToWhereGroup(group: RuleGroupType): WhereGroup {
  const rules: Array<WhereRule | WhereGroup> = [];
  for (const r of group.rules) {
    if ("rules" in r) {
      rules.push(ruleGroupToWhereGroup(r));
    } else if (r.field && r.operator) {
      rules.push({
        field: String(r.field),
        operator: String(r.operator),
        value: r.value == null ? "" : String(r.value),
      });
    }
  }
  return {
    combinator: group.combinator === "or" ? "or" : "and",
    rules,
  };
}
