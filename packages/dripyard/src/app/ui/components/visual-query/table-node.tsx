import "@xyflow/react/dist/style.css";

import { memo, useContext, createContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Key } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TableNodeData } from "./types";

export type TableFlowNode = Node<TableNodeData, "table">;

export const ColumnToggleContext = createContext<
  ((nodeId: string, columnName: string) => void) | null
>(null);

const handleStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  background: "var(--accent)",
  border: "2px solid var(--bg)",
  borderRadius: "50%",
  zIndex: 100,
};

export const TableNode = memo(function TableNode({
  id,
  data,
  selected,
}: NodeProps<TableFlowNode>) {
  const toggle = useContext(ColumnToggleContext);
  const { tableName, alias, columns, primaryKey } = data;
  const pkSet = new Set(primaryKey);

  return (
    <div
      className={cn(
        "w-[240px] rounded-md border bg-[var(--panel)] text-[var(--text)] shadow-lg",
        selected ? "border-[var(--accent)]" : "border-[var(--border-muted)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] rounded-t-md px-2.5 py-1.5">
        <span className="truncate text-xs font-semibold">{tableName}</span>
        {alias && alias !== tableName ? (
          <span className="truncate text-[10px] text-[var(--muted)]">
            {alias}
          </span>
        ) : null}
      </div>

      <div className="rounded-b-md">
        {columns.map((col) => {
          const isPk = pkSet.has(col.name);
          return (
            <div
              key={col.name}
              className="group relative flex h-7 items-center gap-1.5 border-b border-[var(--border-subtle)] px-2.5 last:border-b-0"
            >
              <Handle
                type="source"
                position={Position.Left}
                id={`${id}-source-${col.name}`}
                isConnectable
                style={handleStyle}
              />

              <input
                type="checkbox"
                checked={col.selected}
                onChange={() => toggle?.(id, col.name)}
                className="nodrag size-3 cursor-pointer accent-[var(--accent)]"
              />

              {isPk ? (
                <Key className="nodrag size-3 flex-none text-[var(--accent)]" />
              ) : null}

              <span
                className={cn(
                  "nodrag flex-1 truncate font-mono text-[11px]",
                  col.selected ? "text-[var(--accent)]" : "text-[var(--text)]",
                )}
              >
                {col.name}
              </span>

              <span className="nodrag flex-none text-right font-mono text-[10px] text-[var(--muted)]">
                {col.type}
              </span>

              <Handle
                type="target"
                position={Position.Right}
                id={`${id}-target-${col.name}`}
                isConnectable
                style={handleStyle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
