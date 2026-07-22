import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, type DragEvent } from "react";

import { ColumnToggleContext, TableNode } from "./table-node";
import type { DragTablePayload } from "./table-sidebar";
import type { JoinEdgeData, TableNodeData } from "./types";

const nodeTypes = { table: TableNode } satisfies NodeTypes;

const defaultEdgeOptions = {
  type: "smoothstep",
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: "var(--accent)" },
};

export interface CanvasProps {
  nodes: Node<TableNodeData>[];
  edges: Edge<JoinEdgeData>[];
  onNodesChange: (changes: NodeChange<Node<TableNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge<JoinEdgeData>>[]) => void;
  onConnect: (connection: Connection) => void;
  onColumnToggle: (nodeId: string, columnName: string) => void;
  onTableDrop: (payload: DragTablePayload, x: number, y: number) => void;
}

function CanvasInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onColumnToggle,
  onTableDrop,
}: CanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/reactflow");
      if (!raw) return;
      try {
        const payload: DragTablePayload = JSON.parse(raw);
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        onTableDrop(payload, pos.x, pos.y);
      } catch {}
    },
    [screenToFlowPosition, onTableDrop],
  );

  return (
    <div className="h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={defaultEdgeOptions}
        colorMode="dark"
        connectionMode="loose"
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="h-full w-full bg-[var(--bg)]"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1.5}
          color="var(--border-muted)"
        />
        <Controls />
        <MiniMap
          pannable
          zoomable
          bgColor="var(--panel)"
          maskColor="rgba(10, 24, 33, 0.65)"
          nodeColor="var(--panel-raised)"
          nodeStrokeColor="var(--border-strong)"
          nodeBorderRadius={4}
        />
      </ReactFlow>
    </div>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <ColumnToggleContext.Provider value={props.onColumnToggle}>
        <CanvasInner {...props} />
      </ColumnToggleContext.Provider>
    </ReactFlowProvider>
  );
}
