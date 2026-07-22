import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Package, Search, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useSubscription } from "@/hooks/use-subscription";
import type { TableColumn } from "./types";

type PluginTable = {
  name: string;
  description: string | null;
  columnCount: number;
  hasPrimaryKey: boolean;
  primaryKey: string[];
  keyColumns: Array<{ name: string; required: string }>;
};

type Plugin = {
  name: string;
  version: string;
  tables: PluginTable[];
  connections: string[];
};

type CatalogEntry = {
  plugin: string;
  table: string;
  description: string | null;
  columns: Array<{ name: string; type: string }>;
  primaryKey: string[];
  keyColumns: Array<{ name: string; required: string }>;
};

export interface DragTablePayload {
  pluginName: string;
  tableName: string;
  columns: TableColumn[];
  primaryKey: string[];
  keyColumns: Array<{ name: string; required: string }>;
}

export interface TableSidebarProps {
  /** Called when a table is added to the canvas (click or drop). */
  onTableDrop: (
    pluginName: string,
    tableName: string,
    columns: TableColumn[],
  ) => void;
}

/** Coerce a raw column type string into the builder's ColumnType union. */
function coerceColumnType(raw: string): TableColumn["type"] {
  const t = raw.toLowerCase();
  if (t.includes("char") || t.includes("text") || t.includes("string") || t.includes("uuid"))
    return "string";
  if (
    t.includes("int") ||
    t.includes("long") ||
    t.includes("short") ||
    t.includes("float") ||
    t.includes("double") ||
    t.includes("decimal") ||
    t.includes("numeric") ||
    t.includes("number")
  )
    return "number";
  if (t.includes("bool")) return "boolean";
  if (t.includes("date") || t.includes("time") || t.includes("timestamp"))
    return "datetime";
  if (t.includes("json") || t.includes("struct") || t.includes("map") || t.includes("array"))
    return "json";
  return "string";
}

export function TableSidebar({ onTableDrop }: TableSidebarProps) {
  const plugins = useSubscription<Plugin[]>("workspace.plugins") ?? [];
  const catalog = useSubscription<CatalogEntry[]>("workspace.catalog") ?? [];
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const columnsByPluginTable = useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const e of catalog) m.set(`${e.plugin}\0${e.table}`, e);
    return m;
  }, [catalog]);

  const resolveColumns = (pluginName: string, tableName: string): TableColumn[] => {
    const entry = columnsByPluginTable.get(`${pluginName}\0${tableName}`);
    if (!entry) return [];
    return entry.columns.map((c) => ({
      name: c.name,
      type: coerceColumnType(c.type),
      selected: false,
    }));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plugins;
    return plugins
      .map((p) => ({
        ...p,
        tables: p.tables.filter((t) => t.name.toLowerCase().includes(q)),
      }))
      .filter((p) => p.tables.length > 0);
  }, [plugins, query]);

  const togglePlugin = (name: string) =>
    setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  const addTable = (pluginName: string, table: PluginTable) => {
    onTableDrop(pluginName, table.name, resolveColumns(pluginName, table.name));
  };

  const onDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    pluginName: string,
    table: PluginTable,
  ) => {
    const payload: DragTablePayload = {
      pluginName,
      tableName: table.name,
      columns: resolveColumns(pluginName, table.name),
      primaryKey: table.primaryKey,
      keyColumns: table.keyColumns,
    };
    event.dataTransfer.setData("application/reactflow", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--panel)]">
      <div className="flex-none border-b border-[var(--border-subtle)] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-[var(--muted)]">No tables found.</p>
        ) : (
          filtered.map((p) => {
            const isCollapsed = collapsed[p.name] ?? false;
            return (
              <div
                key={p.name}
                className="border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => togglePlugin(p.name)}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[var(--panel-raised)]"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 flex-none text-[var(--muted)]" />
                  ) : (
                    <ChevronDown className="size-3.5 flex-none text-[var(--muted)]" />
                  )}
                  <Package className="size-3.5 flex-none text-[var(--accent)]" />
                  <span className="truncate text-xs font-semibold">
                    {p.name}
                  </span>
                  <span className="ml-auto flex-none text-[10px] text-[var(--muted)]">
                    {p.tables.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="pb-1">
                    {p.tables.map((t) => (
                      <div
                        key={t.name}
                        draggable
                        onDragStart={(e) => onDragStart(e, p.name, t)}
                        onClick={() => addTable(p.name, t)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            addTable(p.name, t);
                          }
                        }}
                        className="group flex cursor-grab items-center gap-1.5 py-1 pl-7 pr-2 hover:bg-[var(--panel-raised)] active:cursor-grabbing"
                        title={t.description ?? `Add ${t.name} to canvas`}
                      >
                        <Table2 className="size-3.5 flex-none text-[var(--muted)] group-hover:text-[var(--text)]" />
                        <code className="truncate text-[11px] text-[var(--text)]">
                          {t.name}
                        </code>
                        <Badge
                          variant="outline"
                          className="ml-auto flex-none text-[10px] text-[var(--muted)]"
                        >
                          {t.columnCount}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
