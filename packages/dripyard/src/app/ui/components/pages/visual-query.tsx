import {
  CircleHelp,
  Copy,
  Download,
  Keyboard,
  Link2,
  MousePointerClick,
  Play,
  Save,
  Trash2,
  CheckSquare,
  FolderOpen,
  X,
  PanelLeft,
  PanelRight,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  Edit3,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { DragTablePayload } from "@/components/visual-query/table-sidebar";
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

type SavedQuery = {
  name: string;
  nodes: Node<TableNodeData>[];
  edges: Edge<JoinEdgeData>[];
  whereRules: RuleGroupType;
  sql: string;
  savedAt: number;
};

const STORAGE_KEY = "dripyard:visual-queries";

function loadSavedQueries(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedQuery[]) : [];
  } catch {
    return [];
  }
}

function persistSavedQueries(qs: SavedQuery[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(qs));
  } catch {}
}

const SESSION_KEY = "dripyard:visual-query-session";

type SessionState = {
  nodes: Node<TableNodeData>[];
  edges: Edge<JoinEdgeData>[];
  whereRules: RuleGroupType;
  sqlLocked: boolean;
  editedSql: string;
};

function loadSession(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionState) : null;
  } catch {
    return null;
  }
}

function saveSession(state: SessionState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {}
}

export function VisualQueryPage() {
  const plugins = useSubscription<Plugin[]>("workspace.plugins") ?? [];

  // Restore from sessionStorage on mount — survives navigation away and back
  const session = useMemo(() => loadSession(), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>(
    session?.nodes ?? [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<JoinEdgeData>>(
    session?.edges ?? [],
  );

  const [whereRules, setWhereRules] = useState<RuleGroupType>(
    session?.whereRules ?? { combinator: "and", rules: [] },
  );

  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [showLegend, setShowLegend] = useState(true);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [copied, setCopied] = useState(false);

  // Panel layout state
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(400);
  const [sqlHeight, setSqlHeight] = useState(80);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showSql, setShowSql] = useState(true);
  const [showWhere, setShowWhere] = useState(true);

  // SQL editor state — locked by default (read-only from visual builder),
  // unlock to hand-edit. No validation — just a textarea.
  const [sqlLocked, setSqlLocked] = useState(session?.sqlLocked ?? true);
  const [editedSql, setEditedSql] = useState(session?.editedSql ?? "");

  // Save to sessionStorage on unmount — survives navigation away and back
  useEffect(() => {
    return () => {
      saveSession({ nodes, edges, whereRules, sqlLocked, editedSql });
    };
  }, [nodes, edges, whereRules, sqlLocked, editedSql]);

  // Drag-to-resize
  const dragRef = useRef<{ type: string; start: number; size: number } | null>(null);

  const startDrag = useCallback((type: "left" | "right" | "sql", e: React.MouseEvent) => {
    e.preventDefault();
    const start = type === "sql" ? e.clientY : e.clientX;
    const size = type === "left" ? leftWidth : type === "right" ? rightWidth : sqlHeight;
    dragRef.current = { type, start, size };
  }, [leftWidth, rightWidth, sqlHeight]);

  useEffect(() => {
    if (!dragRef.current) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.type === "left") {
        setLeftWidth(Math.max(180, Math.min(400, d.size + (e.clientX - d.start))));
      } else if (d.type === "right") {
        setRightWidth(Math.max(300, Math.min(900, d.size - (e.clientX - d.start))));
      } else if (d.type === "sql") {
        setSqlHeight(Math.max(40, Math.min(400, d.size - (e.clientY - d.start))));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragRef.current]);

  useEffect(() => {
    setSavedQueries(loadSavedQueries());
  }, []);

  const handleTableDrop = useCallback(
    (
      pluginName: string,
      tableName: string,
      columns: TableColumn[],
      x?: number,
      y?: number,
    ) => {
      setNodes((nds) => {
        const existing = new Set(nds.map((n) => n.data.alias));
        const alias = generateAlias(tableName, existing);
        const newNode: Node<TableNodeData> = {
          id: `${tableName}-${nds.length}-${Date.now()}`,
          type: "table",
          position: {
            x: x ?? 80 + nds.length * 300,
            y: y ?? 60 + (nds.length % 3) * 200,
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

  const handleCanvasDrop = useCallback(
    (payload: DragTablePayload, x: number, y: number) => {
      handleTableDrop(payload.pluginName, payload.tableName, payload.columns, x, y);
    },
    [handleTableDrop],
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
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            data: {
              joinType: "INNER",
              sourceColumn: extractColumn(connection.sourceHandle),
              targetColumn: extractColumn(connection.targetHandle),
            },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

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

  const generatedSql = useMemo(() => generateSql(graph), [graph]);

  // When locked, SQL is generated from the visual graph.
  // When unlocked, the user can hand-edit; we use editedSql.
  const sql = sqlLocked ? generatedSql : editedSql;

  // Sync editedSql when re-locking or when graph changes while locked
  useEffect(() => {
    if (sqlLocked) setEditedSql(generatedSql);
  }, [generatedSql, sqlLocked]);

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return;
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

  const canRun = sql.trim().length > 0 && !sql.trim().startsWith("--");

  const copySql = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [sql]);

  const downloadCsv = useCallback(() => {
    if (!result?.rows?.length) return;
    const cols = Object.keys(result.rows[0]);
    const csv = [
      cols.join(","),
      ...result.rows.map((r) =>
        cols.map((c) => {
          const v = r[c];
          if (v == null) return "";
          const s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        }).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const saveQuery = useCallback(() => {
    if (!saveName.trim()) return;
    const sq: SavedQuery = {
      name: saveName.trim(),
      nodes,
      edges,
      whereRules,
      sql,
      savedAt: Date.now(),
    };
    const updated = savedQueries.filter((q) => q.name !== sq.name);
    updated.unshift(sq);
    setSavedQueries(updated);
    persistSavedQueries(updated);
    setShowSaveDialog(false);
    setSaveName("");
  }, [saveName, nodes, edges, whereRules, sql, savedQueries]);

  const loadQuery = useCallback(
    (sq: SavedQuery) => {
      setNodes(sq.nodes);
      setEdges(sq.edges);
      setWhereRules(sq.whereRules);
      setShowLoadDialog(false);
    },
    [setNodes, setEdges],
  );

  const deleteSavedQuery = useCallback(
    (name: string) => {
      const updated = savedQueries.filter((q) => q.name !== name);
      setSavedQueries(updated);
      persistSavedQueries(updated);
    },
    [savedQueries],
  );

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
          <div className="flex items-center gap-1.5">
            <Button onClick={() => setShowSaveDialog(true)} variant="outline" size="sm" disabled={nodes.length === 0}>
              <Save className="size-3.5 mr-1" />
              Save
            </Button>
            <Button onClick={() => setShowLoadDialog(true)} variant="outline" size="sm" disabled={savedQueries.length === 0}>
              <FolderOpen className="size-3.5 mr-1" />
              Load
            </Button>
            <Button onClick={copySql} variant="outline" size="sm" disabled={!sql || sql.startsWith("--")}>
              {copied ? <CheckSquare className="size-3.5 mr-1" /> : <Copy className="size-3.5 mr-1" />}
              {copied ? "Copied!" : "Copy SQL"}
            </Button>
            <Button onClick={downloadCsv} variant="outline" size="sm" disabled={!result?.rows?.length}>
              <Download className="size-3.5 mr-1" />
              CSV
            </Button>
            <Button onClick={() => void runQuery()} disabled={running || !canRun} size="sm">
              <Play className="size-3.5 mr-1" />
              {running ? "Running…" : "Run"}
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 gap-0 px-4 pb-4 min-w-0">
        {/* Left — table palette */}
        {showLeft ? (
          <>
            <div className="flex-none min-h-0 overflow-auto border border-[var(--border-muted)] rounded-l bg-[var(--panel)]/40" style={{ width: leftWidth }}>
              <TableSidebar onTableDrop={handleTableDrop} />
            </div>
            <div
              className="w-1 flex-none cursor-col-resize bg-[var(--border-subtle)] hover:bg-[var(--accent)]/50 transition-colors"
              onMouseDown={(e) => startDrag("left", e)}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowLeft(true)}
            className="w-6 flex-none flex items-center justify-center border border-[var(--border-muted)] rounded-l bg-[var(--panel)]/40 text-[var(--muted)] hover:text-[var(--accent)]"
            title="Show table sidebar"
          >
            <PanelLeft className="size-3.5" />
          </button>
        )}

        {/* Center — canvas + live SQL preview */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 min-h-0 relative">
          <div className="flex-1 min-h-0 border border-[var(--border-muted)] rounded overflow-hidden relative">
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onColumnToggle={handleColumnToggle}
              onTableDrop={handleCanvasDrop}
            />

            {/* Floating panel toggle buttons */}
            <div className="absolute top-2 left-2 z-50 flex gap-1">
              <button
                type="button"
                onClick={() => setShowLeft((v) => !v)}
                className={`flex items-center gap-1 rounded-md border border-[var(--border-muted)] bg-[var(--panel)]/90 px-1.5 py-1 text-[10px] backdrop-blur-sm ${showLeft ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
                title="Toggle table sidebar"
              >
                <PanelLeft className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setShowRight((v) => !v)}
                className={`flex items-center gap-1 rounded-md border border-[var(--border-muted)] bg-[var(--panel)]/90 px-1.5 py-1 text-[10px] backdrop-blur-sm ${showRight ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
                title="Toggle WHERE + results panel"
              >
                <PanelRight className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setShowSql((v) => !v)}
                className={`flex items-center gap-1 rounded-md border border-[var(--border-muted)] bg-[var(--panel)]/90 px-1.5 py-1 text-[10px] backdrop-blur-sm ${showSql ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
                title="Toggle SQL preview"
              >
                {showSql ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
                SQL
              </button>
            </div>

            {/* Legend toggle button */}
            <button
              type="button"
              onClick={() => setShowLegend((v) => !v)}
              className="absolute top-2 right-2 z-50 flex items-center gap-1 rounded-md border border-[var(--border-muted)] bg-[var(--panel)]/90 px-2 py-1 text-[10px] text-[var(--muted)] hover:text-[var(--text)] backdrop-blur-sm"
            >
              <CircleHelp className="size-3" />
              {showLegend ? "Hide help" : "Show help"}
            </button>

            {/* Legend / help overlay */}
            {showLegend && (
              <div className="absolute bottom-3 right-3 w-[240px] rounded-md border border-[var(--border-muted)] bg-[var(--panel)]/95 backdrop-blur-sm p-3 text-[11px] text-[var(--muted)] shadow-lg z-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-[var(--text)] font-semibold">
                    <CircleHelp className="size-3.5" />
                    How to use
                  </span>
                  <button type="button" onClick={() => setShowLegend(false)} className="text-[var(--muted)] hover:text-[var(--text)]">
                    <X className="size-3" />
                  </button>
                </div>
                <ul className="space-y-1.5">
                  <li className="flex items-start gap-1.5">
                    <MousePointerClick className="size-3 mt-0.5 flex-none text-[var(--accent)]" />
                    <span><b className="text-[var(--text)]">Add table</b> — click or drag from sidebar</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Link2 className="size-3 mt-0.5 flex-none text-[var(--accent)]" />
                    <span><b className="text-[var(--text)]">Join</b> — drag from blue dot to blue dot</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Trash2 className="size-3 mt-0.5 flex-none text-[var(--error)]" />
                    <span><b className="text-[var(--text)]">Delete</b> — click line/table, press Delete</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckSquare className="size-3 mt-0.5 flex-none text-[var(--accent)]" />
                    <span><b className="text-[var(--text)]">Columns</b> — toggle checkboxes</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Keyboard className="size-3 mt-0.5 flex-none text-[var(--accent)]" />
                    <span><b className="text-[var(--text)]">Run</b> — Cmd/Ctrl+Enter</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {showSql && (
            <div className="flex-none flex flex-col" style={{ height: sqlHeight }}>
              <div className="flex items-center justify-between px-1 pb-0.5 flex-none">
                <span className="text-[10px] text-[var(--muted)]">
                  {sqlLocked ? "Generated SQL (read-only)" : "SQL editor (manual)"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (sqlLocked) {
                        setEditedSql(generatedSql);
                        setSqlLocked(false);
                      } else {
                        setSqlLocked(true);
                      }
                    }}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel-raised)]"
                    title={sqlLocked ? "Unlock to edit SQL manually" : "Lock — revert to generated SQL"}
                  >
                    {sqlLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                    {sqlLocked ? "Unlock" : "Lock"}
                  </button>
                  {!sqlLocked && (
                    <button
                      type="button"
                      onClick={() => { setEditedSql(generatedSql); }}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel-raised)]"
                      title="Reset to generated SQL"
                    >
                      <Edit3 className="size-3" />
                      Reset
                    </button>
                  )}
                </div>
              </div>
              {/* Drag handle to resize SQL panel height */}
              <div
                className="h-1 flex-none cursor-row-resize bg-[var(--border-subtle)] hover:bg-[var(--accent)]/50 transition-colors -mt-0.5"
                onMouseDown={(e) => startDrag("sql", e)}
              />
              <textarea
                readOnly={sqlLocked}
                value={sql}
                onChange={(e) => setEditedSql(e.target.value)}
                spellCheck={false}
                className="font-mono text-xs bg-[var(--panel)]/40 border border-[var(--border-muted)] rounded p-2 flex-1 min-h-0 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30"
              />
            </div>
          )}
        </div>

        {/* Right — WHERE builder + results */}
        {showRight ? (
          <>
            <div
              className="w-1 flex-none cursor-col-resize bg-[var(--border-subtle)] hover:bg-[var(--accent)]/50 transition-colors"
              onMouseDown={(e) => startDrag("right", e)}
            />
            <div className="flex-none flex flex-col gap-2 min-h-0" style={{ width: rightWidth }}>
              {showWhere && (
                <div className="flex-none">
                  <WhereBuilder
                    fields={fields}
                    value={whereRules}
                    onChange={setWhereRules}
                  />
                </div>
              )}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center gap-2 px-2 py-1 flex-none">
                  <button
                    type="button"
                    onClick={() => setShowWhere((v) => !v)}
                    className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)]"
                  >
                    {showWhere ? "▼ Hide WHERE" : "▶ Show WHERE"}
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <ResultsPanel result={result} error={error} loading={running} />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowSaveDialog(false)}>
          <div className="w-[360px] rounded-md border border-[var(--border-muted)] bg-[var(--panel)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Save Visual Query</h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Query name…"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && saveQuery()}
              className="w-full rounded border border-[var(--border-muted)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button onClick={() => setShowSaveDialog(false)} variant="outline" size="sm">Cancel</Button>
              <Button onClick={saveQuery} size="sm" disabled={!saveName.trim()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Load dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowLoadDialog(false)}>
          <div className="w-[400px] max-h-[400px] rounded-md border border-[var(--border-muted)] bg-[var(--panel)] p-4 shadow-xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Saved Queries</h3>
            {savedQueries.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No saved queries yet.</p>
            ) : (
              <div className="space-y-1">
                {savedQueries.map((sq) => (
                  <div key={sq.name} className="flex items-center gap-2 rounded border border-[var(--border-subtle)] px-2 py-1.5 hover:bg-[var(--panel-raised)]">
                    <button
                      type="button"
                      onClick={() => loadQuery(sq)}
                      className="flex-1 text-left"
                    >
                      <div className="text-xs font-medium text-[var(--text)]">{sq.name}</div>
                      <div className="text-[10px] text-[var(--muted)]">
                        {sq.nodes.length} tables · {sq.edges.length} joins · {new Date(sq.savedAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedQuery(sq.name)}
                      className="text-[var(--muted)] hover:text-[var(--error)]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button onClick={() => setShowLoadDialog(false)} variant="outline" size="sm">Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function extractColumn(handleId: string | null | undefined): string {
  if (!handleId) return "";
  const srcIdx = handleId.lastIndexOf("-source-");
  if (srcIdx !== -1) return handleId.slice(srcIdx + 8);
  const tgtIdx = handleId.lastIndexOf("-target-");
  if (tgtIdx !== -1) return handleId.slice(tgtIdx + 8);
  return handleId;
}

function generateAlias(tableName: string, existing: Set<string>): string {
  const base = (tableName[0] ?? "t").toLowerCase();
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

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
