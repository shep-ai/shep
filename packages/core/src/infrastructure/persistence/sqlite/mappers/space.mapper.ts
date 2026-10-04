/**
 * Space Database Mappers (spec 120)
 *
 * Row <-> entity conversion for spaces, product lines, space rules and
 * repository space assignments. Dates are INTEGER unix milliseconds; optional
 * domain fields are nullable columns.
 */

import type {
  AgentType,
  PrCommentTrigger,
  ProductLine,
  RepositorySpaceAssignment,
  Space,
  SpaceAgentSettings,
  SpaceRule,
  SpaceRuleKind,
} from '../../../../domain/generated/output.js';
import { normalizeRepositoryPath } from '../../../../domain/shared/repository-path.js';
import { millis } from './row-values.js';

export interface SpaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  is_default: number;
  claude_config_dir: string | null;
  gh_config_dir: string | null;
  git_author_name: string | null;
  git_author_email: string | null;
  aws_profile: string | null;
  /** 1 = on, 0 = off, NULL = inherit the host. */
  use_bedrock: number | null;
  /** JSON array of AgentType values. */
  allowed_agent_types: string | null;
  /** PrCommentTrigger; NULL = the default (Mention). */
  pr_comment_trigger: string | null;
  /** 1 = resolve, 0 or NULL = leave threads open. */
  pr_comment_resolve_threads: number | null;
  created_at: number;
  updated_at: number;
}

export interface ProductLineRow {
  id: string;
  space_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface SpaceRuleRow {
  id: string;
  space_id: string;
  product_line_id: string | null;
  kind: string;
  pattern: string;
  priority: number;
  created_at: number;
  updated_at: number;
}

export interface RepositorySpaceAssignmentRow {
  repository_path: string;
  space_id: string;
  product_line_id: string | null;
  created_at: number;
  updated_at: number;
}

function withOptional<T extends object, K extends string>(
  entity: T,
  key: K,
  value: string | null
): T & Partial<Record<K, string>> {
  return value === null ? entity : { ...entity, [key]: value };
}

export function spaceToDatabase(space: Space): SpaceRow {
  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description ?? null,
    color: space.color ?? null,
    is_default: space.isDefault ? 1 : 0,
    ...agentSettingsToColumns(space.agentSettings),
    created_at: millis(space.createdAt),
    updated_at: millis(space.updatedAt),
  };
}

type AgentSettingsColumns = Pick<
  SpaceRow,
  | 'claude_config_dir'
  | 'gh_config_dir'
  | 'git_author_name'
  | 'git_author_email'
  | 'aws_profile'
  | 'use_bedrock'
  | 'allowed_agent_types'
  | 'pr_comment_trigger'
  | 'pr_comment_resolve_threads'
>;

function agentSettingsToColumns(settings: SpaceAgentSettings | undefined): AgentSettingsColumns {
  const allowed = settings?.allowedAgentTypes;
  return {
    claude_config_dir: settings?.claudeConfigDir ?? null,
    gh_config_dir: settings?.ghConfigDir ?? null,
    git_author_name: settings?.gitAuthorName ?? null,
    git_author_email: settings?.gitAuthorEmail ?? null,
    aws_profile: settings?.awsProfile ?? null,
    use_bedrock: settings?.useBedrock === undefined ? null : settings.useBedrock ? 1 : 0,
    allowed_agent_types: allowed && allowed.length > 0 ? JSON.stringify(allowed) : null,
    pr_comment_trigger: settings?.prCommentTrigger ?? null,
    pr_comment_resolve_threads:
      settings?.prCommentResolveThreads === undefined
        ? null
        : settings.prCommentResolveThreads
          ? 1
          : 0,
  };
}

/** The settings stored on a row, or undefined when every column is NULL. */
function agentSettingsFromColumns(row: AgentSettingsColumns): SpaceAgentSettings | undefined {
  const settings: SpaceAgentSettings = {
    ...(row.claude_config_dir !== null ? { claudeConfigDir: row.claude_config_dir } : {}),
    ...(row.gh_config_dir !== null ? { ghConfigDir: row.gh_config_dir } : {}),
    ...(row.git_author_name !== null ? { gitAuthorName: row.git_author_name } : {}),
    ...(row.git_author_email !== null ? { gitAuthorEmail: row.git_author_email } : {}),
    ...(row.aws_profile !== null ? { awsProfile: row.aws_profile } : {}),
    ...(row.use_bedrock !== null ? { useBedrock: row.use_bedrock === 1 } : {}),
    ...(row.allowed_agent_types !== null
      ? { allowedAgentTypes: JSON.parse(row.allowed_agent_types) as AgentType[] }
      : {}),
    ...(row.pr_comment_trigger !== null
      ? { prCommentTrigger: row.pr_comment_trigger as PrCommentTrigger }
      : {}),
    ...(row.pr_comment_resolve_threads !== null
      ? { prCommentResolveThreads: row.pr_comment_resolve_threads === 1 }
      : {}),
  };
  return Object.keys(settings).length > 0 ? settings : undefined;
}

export function spaceFromDatabase(row: SpaceRow): Space {
  const base: Space = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isDefault: row.is_default === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
  const agentSettings = agentSettingsFromColumns(row);
  return withOptional(
    withOptional(agentSettings ? { ...base, agentSettings } : base, 'description', row.description),
    'color',
    row.color
  );
}

export function productLineToDatabase(line: ProductLine): ProductLineRow {
  return {
    id: line.id,
    space_id: line.spaceId,
    name: line.name,
    slug: line.slug,
    description: line.description ?? null,
    created_at: millis(line.createdAt),
    updated_at: millis(line.updatedAt),
  };
}

export function productLineFromDatabase(row: ProductLineRow): ProductLine {
  return withOptional(
    {
      id: row.id,
      spaceId: row.space_id,
      name: row.name,
      slug: row.slug,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    'description',
    row.description
  );
}

export function spaceRuleToDatabase(rule: SpaceRule): SpaceRuleRow {
  return {
    id: rule.id,
    space_id: rule.spaceId,
    product_line_id: rule.productLineId ?? null,
    kind: rule.kind,
    pattern: rule.pattern,
    priority: rule.priority,
    created_at: millis(rule.createdAt),
    updated_at: millis(rule.updatedAt),
  };
}

export function spaceRuleFromDatabase(row: SpaceRuleRow): SpaceRule {
  return withOptional(
    {
      id: row.id,
      spaceId: row.space_id,
      kind: row.kind as SpaceRuleKind,
      pattern: row.pattern,
      priority: row.priority,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    'productLineId',
    row.product_line_id
  );
}

export function assignmentToDatabase(
  assignment: RepositorySpaceAssignment
): RepositorySpaceAssignmentRow {
  return {
    repository_path: normalizeRepositoryPath(assignment.repositoryPath),
    space_id: assignment.spaceId,
    product_line_id: assignment.productLineId ?? null,
    created_at: millis(assignment.createdAt),
    updated_at: millis(assignment.updatedAt),
  };
}

export function assignmentFromDatabase(
  row: RepositorySpaceAssignmentRow
): RepositorySpaceAssignment {
  return withOptional(
    {
      repositoryPath: row.repository_path,
      spaceId: row.space_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    'productLineId',
    row.product_line_id
  );
}
