/**
 * Meta-tools the model always has in query-aware mode (spec 119, research
 * "Loop and tool-calling protocol"):
 *
 * - use_capability: ask for a capability by id; its Tier-2 schema is loaded
 *   and becomes a callable tool from the next turn.
 * - expand_chunk: see a chunk in more detail next turn, from stored raw
 *   content (the original tool is never re-run).
 * - complete_task: finish with a structured result.
 */
import { ChunkVisibility } from '../../../domain/generated/output.js';
import type { HarnessToolSpec } from '../../ports/output/harness/index.js';

export const MetaTool = {
  UseCapability: 'use_capability',
  ExpandChunk: 'expand_chunk',
  CompleteTask: 'complete_task',
} as const;

export const USE_CAPABILITY_TOOL: HarnessToolSpec = {
  name: MetaTool.UseCapability,
  description:
    'Load a capability (from the capability list) so you can call it next turn. Say what you intend to do with it.',
  inputSchema: {
    type: 'object',
    properties: {
      capabilityId: { type: 'string', description: 'Capability id, e.g. search_source_code' },
      intent: { type: 'string', description: 'What you want to do and why' },
      withDocs: { type: 'boolean', description: 'Also load the long-form usage docs' },
    },
    required: ['intent'],
    additionalProperties: false,
  },
};

export const EXPAND_CHUNK_TOOL: HarnessToolSpec = {
  name: MetaTool.ExpandChunk,
  description:
    'Show a context chunk (by id) in more detail on the next turn. Uses stored content; nothing is re-run.',
  inputSchema: {
    type: 'object',
    properties: {
      chunkId: { type: 'string' },
      level: {
        type: 'string',
        enum: [ChunkVisibility.Short, ChunkVisibility.Long, ChunkVisibility.Full],
      },
    },
    required: ['chunkId'],
    additionalProperties: false,
  },
};

export const COMPLETE_TASK_TOOL: HarnessToolSpec = {
  name: MetaTool.CompleteTask,
  description:
    'Finish the task with a structured result. Call this once the work is done (or cannot be done).',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'partial', 'failure'] },
      summary: { type: 'string', description: 'What was done, for the person reading the result' },
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            resource: { type: 'string' },
            startLine: { type: 'integer' },
            endLine: { type: 'integer' },
          },
          required: ['resource'],
          additionalProperties: false,
        },
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['status', 'summary'],
    additionalProperties: false,
  },
};

export const QUERY_AWARE_META_TOOLS: readonly HarnessToolSpec[] = [
  USE_CAPABILITY_TOOL,
  EXPAND_CHUNK_TOOL,
  COMPLETE_TASK_TOOL,
];
