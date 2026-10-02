/**
 * Describes a tool call as an action for permission evaluation (spec 119):
 * which resources it touches and which effects it is predicted to have.
 */
import {
  ToolReadWriteMode,
  type ActionDescriptor,
  type EffectDescriptor,
  type ResourceDescriptor,
  type ToolImplementation,
} from '../../../domain/generated/output.js';
import { isPathInside } from '../../../domain/shared/path-confinement.js';
import type { ICommandInspector } from '../../ports/output/harness/index.js';

export interface DescribedAction {
  action: ActionDescriptor;
  resources: ResourceDescriptor[];
  effects: EffectDescriptor[];
}

function joinPath(base: string, rel: string): string {
  if (/^([a-zA-Z]:)?[\\/]/.test(rel)) return rel;
  return `${base.replace(/[\\/]+$/, '')}/${rel.replace(/^\.\//, '')}`;
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const p of path.replace(/\\/g, '/').split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.' && p !== '') parts.push(p);
  }
  const lead = /^[a-zA-Z]:/.test(path) ? '' : '/';
  return lead + parts.join('/');
}

function patchPaths(patch: string): string[] {
  return [...patch.matchAll(/^(?:\+\+\+|---) (?:[ab]\/)?(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((p) => p !== '/dev/null');
}

export class ActionDescriber {
  constructor(private readonly inspector: ICommandInspector) {}

  describe(
    impl: ToolImplementation,
    args: Record<string, unknown>,
    ctx: { cwd: string; repoRoot: string; intent?: string; testCommand?: string }
  ): DescribedAction {
    const resources: ResourceDescriptor[] = [];
    let effects: EffectDescriptor[] = [];
    const path = (raw: unknown, access: string) => {
      if (typeof raw !== 'string' || !raw) return;
      const value = normalize(joinPath(ctx.cwd, raw));
      resources.push({
        kind: 'path',
        value,
        access,
        outsideRepo: !isPathInside(ctx.repoRoot, value),
      });
    };
    let summary: string;
    switch (impl.capabilityId) {
      case 'read_file':
      case 'list_files':
      case 'search_source_code':
      case 'inspect_git':
        path(args.path, 'read');
        summary =
          `${impl.toolName} ${String(args.path ?? args.query ?? args.pattern ?? args.mode ?? '')}`.trim();
        break;
      case 'apply_patch': {
        const targets = [
          ...((args.edits as { path?: string }[] | undefined) ?? []).map((e) => e.path),
          ...((args.files as { path?: string }[] | undefined) ?? []).map((f) => f.path),
          ...(typeof args.patch === 'string' ? patchPaths(args.patch) : []),
        ];
        for (const t of targets) path(t, 'write');
        summary = `apply_patch ${targets.filter(Boolean).join(', ')}`;
        break;
      }
      case 'run_command': {
        const command = String(args.command ?? '');
        const inspected = this.inspector.inspect(command, ctx.cwd, ctx.repoRoot);
        resources.push(...inspected.resources);
        effects = inspected.effects;
        summary = command;
        break;
      }
      case 'run_tests': {
        const command = `${ctx.testCommand ?? 'test command'}${args.filter ? ` ${String(args.filter)}` : ''}`;
        if (ctx.testCommand) {
          const inspected = this.inspector.inspect(command, ctx.cwd, ctx.repoRoot);
          resources.push(...inspected.resources);
          effects = inspected.effects;
        }
        summary = `run_tests: ${command}`;
        break;
      }
      default:
        summary = `${impl.toolName} ${JSON.stringify(args).slice(0, 200)}`;
    }
    return {
      action: {
        capabilityId: impl.capabilityId,
        actionClass: impl.readWriteMode ?? ToolReadWriteMode.SideEffect,
        summary,
        ...(ctx.intent && { intent: ctx.intent }),
      },
      resources,
      effects,
    };
  }
}
