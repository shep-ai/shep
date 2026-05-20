'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { layoutWithDagre } from '@/lib/layout-with-dagre';
import { resetAgentGraph, saveAgentGraph } from '@/app/actions/agent-graph';

export interface AgentGraphDescriptor {
  agentType: string;
  nodes: { id: string; label: string; description?: string }[];
  edges: { from: string; to: string; label?: string }[];
}

export interface AgentGraphViewProps {
  graph: AgentGraphDescriptor | null;
  /** Bundled descriptor — used by "Reset to bundled" to restore the default. */
  bundled?: AgentGraphDescriptor | null;
  /** True when an override exists; controls badge + reset visibility. */
  hasOverride?: boolean;
  /** Optional override of the save handler — used by tests/Storybook. */
  onSaveOverride?: (input: {
    agentType: string;
    nodes: AgentGraphDescriptor['nodes'];
    edges: AgentGraphDescriptor['edges'];
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Optional override of the reset handler — used by tests/Storybook. */
  onResetOverride?: (input: { agentType: string }) => Promise<{ ok: boolean; error?: string }>;
  /** Force the editor to start in edit mode (Storybook). */
  initialEditing?: boolean;
}

interface NodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  editing: boolean;
  onLabelChange: (id: string, value: string) => void;
  onDescriptionChange: (id: string, value: string) => void;
  onDelete: (id: string) => void;
}

const NODE_TYPES = { editable: EditableNode };

export function AgentGraphView(props: AgentGraphViewProps) {
  const { t } = useTranslation('web');
  if (!props.graph) {
    return (
      <p
        className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
        data-testid="agent-graph-empty"
      >
        {t('agentEditor.noGraphDescriptor')}
      </p>
    );
  }
  return (
    <ReactFlowProvider>
      <AgentGraphInner {...props} graph={props.graph} />
    </ReactFlowProvider>
  );
}

function AgentGraphInner({
  graph,
  bundled,
  hasOverride,
  onSaveOverride,
  onResetOverride,
  initialEditing,
}: AgentGraphViewProps & { graph: AgentGraphDescriptor }) {
  const { t } = useTranslation('web');
  const [editing, setEditing] = useState(Boolean(initialEditing));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();
  const idCounterRef = useRef(0);

  const initial = useMemo(() => buildFlow(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // Re-sync when server data refreshes (revalidatePath after save).
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial.nodes, initial.edges, setNodes, setEdges]);

  const handleLabelChange = useCallback(
    (id: string, value: string) => {
      setNodes((curr) =>
        curr.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: value } } : n))
      );
    },
    [setNodes]
  );

  const handleDescriptionChange = useCallback(
    (id: string, value: string) => {
      setNodes((curr) =>
        curr.map((n) => (n.id === id ? { ...n, data: { ...n.data, description: value } } : n))
      );
    },
    [setNodes]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setNodes((curr) => curr.filter((n) => n.id !== id));
      setEdges((curr) => curr.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges]
  );

  // Inject latest callbacks + editing flag into node.data (without re-laying-out).
  const renderedNodes = useMemo<Node<NodeData>[]>(
    () =>
      nodes.map((n) => ({
        ...n,
        type: 'editable',
        data: {
          ...n.data,
          editing,
          onLabelChange: handleLabelChange,
          onDescriptionChange: handleDescriptionChange,
          onDelete: handleDelete,
        },
      })),
    [nodes, editing, handleLabelChange, handleDescriptionChange, handleDelete]
  );

  function handleConnect(params: Connection) {
    setEdges((curr) => addEdge({ ...params, type: 'smoothstep' }, curr));
  }

  function handleAddNode() {
    idCounterRef.current += 1;
    const id = `node-${Date.now()}-${idCounterRef.current}`;
    setNodes((curr) => [
      ...curr,
      {
        id,
        type: 'editable',
        position: nextPosition(curr),
        data: {
          label: 'New step',
          description: '',
          editing: true,
          onLabelChange: handleLabelChange,
          onDescriptionChange: handleDescriptionChange,
          onDelete: handleDelete,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      },
    ]);
  }

  function handleSave() {
    setError(null);
    const payload = serialize(nodes, edges);
    const validation = validate(payload);
    if (validation) {
      setError(validation);
      return;
    }
    startTransition(async () => {
      const fn = onSaveOverride ?? saveAgentGraph;
      const result = await fn({ agentType: graph.agentType, ...payload });
      if (!result.ok) {
        setError(result.error ?? 'Failed to save graph');
        return;
      }
      setSavedAt(new Date());
      setEditing(false);
    });
  }

  function handleCancel() {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setError(null);
    setEditing(false);
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const fn = onResetOverride ?? resetAgentGraph;
      const result = await fn({ agentType: graph.agentType });
      if (!result.ok) {
        setError(result.error ?? 'Failed to reset graph');
        return;
      }
      setSavedAt(new Date());
      setEditing(false);
      // Re-sync from bundled when caller supplied it; otherwise the
      // revalidatePath in the server action will swap initial via props.
      if (bundled) {
        const fresh = buildFlow(bundled);
        setNodes(fresh.nodes);
        setEdges(fresh.edges);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="agent-graph-view">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{graph.agentType}</p>
          {hasOverride ? (
            <Badge variant="default" data-testid="graph-badge-overridden">
              {t('agentEditor.overridden')}
            </Badge>
          ) : (
            <Badge variant="secondary">{t('agentEditor.bundled')}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddNode}
                disabled={isPending}
                data-testid="graph-add-node"
              >
                <Plus className="size-3" />
                {t('agentEditor.addNode')}
              </Button>
              {hasOverride ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={isPending}
                  data-testid="graph-reset"
                >
                  <RotateCcw className="size-3" />
                  {t('agentEditor.resetToBundled')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
                data-testid="graph-cancel"
              >
                <X className="size-3" />
                {t('agentEditor.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isPending}
                data-testid="graph-save"
              >
                <Save className="size-3" />
                {isPending ? t('agentEditor.saving') : t('agentEditor.saveGraph')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              data-testid="graph-edit"
            >
              <Pencil className="size-3" />
              {t('agentEditor.edit')}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" data-testid="graph-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {savedAt && !editing ? (
        <p className="text-muted-foreground text-xs" data-testid="graph-saved">
          {t('agentEditor.savedAt', { time: savedAt.toLocaleTimeString() })}
        </p>
      ) : null}

      <div className="bg-muted/20 h-[480px] w-full overflow-hidden rounded-lg border">
        <ReactFlow
          nodes={renderedNodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          nodesDraggable={editing}
          nodesConnectable={editing}
          elementsSelectable={editing}
          deleteKeyCode={editing ? ['Backspace', 'Delete'] : null}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

// ── React Flow node ────────────────────────────────────────────────────────────

import { Handle } from '@xyflow/react';

function EditableNode({ id, data }: NodeProps<Node<NodeData>>) {
  const { label, description, editing, onLabelChange, onDescriptionChange, onDelete } = data;
  return (
    <div className="bg-card relative min-w-[180px] rounded-md border px-2 py-1.5 shadow-sm">
      <Handle type="target" position={Position.Left} />
      {editing ? (
        <div className="flex flex-col gap-1">
          <input
            value={label}
            onChange={(e) => onLabelChange(id, e.target.value)}
            className="border-border bg-background w-full rounded border px-1 py-0.5 text-xs font-semibold"
            placeholder="label"
            aria-label={`Label for node ${id}`}
            data-testid={`graph-node-label-${id}`}
          />
          <input
            value={description ?? ''}
            onChange={(e) => onDescriptionChange(id, e.target.value)}
            className="border-border bg-background w-full rounded border px-1 py-0.5 text-[10px]"
            placeholder="description"
            aria-label={`Description for node ${id}`}
            data-testid={`graph-node-description-${id}`}
          />
          <button
            type="button"
            onClick={() => onDelete(id)}
            className="text-destructive absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full border bg-white shadow-sm"
            aria-label={`Delete node ${id}`}
            data-testid={`graph-node-delete-${id}`}
          >
            <Trash2 className="size-2.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-0.5 text-left">
          <span className="text-xs font-semibold">{label}</span>
          {description ? (
            <span className="text-muted-foreground text-[10px]">{description}</span>
          ) : null}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

function buildFlow(graph: AgentGraphDescriptor): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const nodes: Node<NodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'editable',
    position: { x: 0, y: 0 },
    data: {
      label: n.label,
      description: n.description ?? '',
      editing: false,
      onLabelChange: () => undefined,
      onDescriptionChange: () => undefined,
      onDelete: () => undefined,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));

  const edges: Edge[] = graph.edges.map((e, idx) => ({
    id: `e-${idx}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    label: e.label,
    animated: false,
  }));

  const laidOut = layoutWithDagre(nodes, edges, {
    direction: 'LR',
    nodeSize: { width: 220, height: 70 },
    nodesep: 30,
    ranksep: 80,
  });
  return { nodes: laidOut.nodes as Node<NodeData>[], edges: laidOut.edges };
}

function nextPosition(existing: Node<NodeData>[]): { x: number; y: number } {
  if (existing.length === 0) return { x: 0, y: 0 };
  const maxX = existing.reduce((m, n) => Math.max(m, n.position.x), 0);
  const minY = existing.reduce((m, n) => Math.min(m, n.position.y), 0);
  return { x: maxX + 240, y: minY };
}

function serialize(
  nodes: Node<NodeData>[],
  edges: Edge[]
): { nodes: AgentGraphDescriptor['nodes']; edges: AgentGraphDescriptor['edges'] } {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label.trim() || n.id,
      ...(n.data.description?.trim() ? { description: n.data.description.trim() } : {}),
    })),
    edges: edges.map((e) => ({
      from: e.source,
      to: e.target,
      ...(typeof e.label === 'string' && e.label.trim() ? { label: e.label.trim() } : {}),
    })),
  };
}

function validate(payload: {
  nodes: AgentGraphDescriptor['nodes'];
  edges: AgentGraphDescriptor['edges'];
}): string | null {
  if (payload.nodes.length === 0) return 'Graph must have at least one node.';
  const ids = new Set<string>();
  for (const n of payload.nodes) {
    if (!n.label) return `Node ${n.id} must have a label.`;
    if (ids.has(n.id)) return `Duplicate node id: ${n.id}`;
    ids.add(n.id);
  }
  for (const e of payload.edges) {
    if (!ids.has(e.from)) return `Edge references unknown source: ${e.from}`;
    if (!ids.has(e.to)) return `Edge references unknown target: ${e.to}`;
  }
  return null;
}
