import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";

import { ColumnToggleContext, TableNode } from "./table-node";
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
}

export function Canvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onColumnToggle,
}: CanvasProps) {
  return (
    <ColumnToggleContext.Provider value={onColumnToggle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={defaultEdgeOptions}
        colorMode="dark"
        fitView
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
    </ColumnToggleContext.Provider>
  );
}
