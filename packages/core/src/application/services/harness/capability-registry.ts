/**
 * CapabilityRegistry (spec 119, docs/05): capabilities from every tool source,
 * with tiered disclosure.
 *
 * - Tier 1 (`snippetCatalog`): one line per capability, always cheap.
 * - Tier 2 (`schemaFor`): the selected implementation's JSON schema, only
 *   once the router chose it.
 * - Tier 3 (`docsFor`): long-form docs, only on demand.
 */
import type { Capability, ToolImplementation } from '../../../domain/generated/output.js';
import type { IToolExecutor, IToolSource } from '../../ports/output/harness/index.js';

export class CapabilityRegistry {
  private constructor(
    private readonly capabilities: Map<string, Capability>,
    private readonly executors: Map<string, IToolExecutor>
  ) {}

  static async fromSources(sources: readonly IToolSource[]): Promise<CapabilityRegistry> {
    const capabilities = new Map<string, Capability>();
    const executors = new Map<string, IToolExecutor>();
    for (const source of sources) {
      const catalog = await source.discover();
      for (const c of catalog.capabilities) {
        const existing = capabilities.get(c.id);
        capabilities.set(
          c.id,
          existing
            ? {
                ...existing,
                implementationIds: [...existing.implementationIds, ...c.implementationIds],
              }
            : { ...c }
        );
      }
      for (const e of catalog.executors) executors.set(e.implementation.id, e);
    }
    return new CapabilityRegistry(capabilities, executors);
  }

  list(): Capability[] {
    return [...this.capabilities.values()];
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  implementations(capabilityId: string): ToolImplementation[] {
    return (this.capabilities.get(capabilityId)?.implementationIds ?? [])
      .map((id) => this.executors.get(id)?.implementation)
      .filter((i): i is ToolImplementation => i !== undefined);
  }

  executor(implementationId: string): IToolExecutor | undefined {
    return this.executors.get(implementationId);
  }

  /** Implementation exposed to the model under a tool name. */
  byToolName(toolName: string): ToolImplementation | undefined {
    for (const e of this.executors.values()) {
      if (e.implementation.toolName === toolName) return e.implementation;
    }
    return undefined;
  }

  /** Tier 1: `id — snippet` lines for the given capabilities (all by default). */
  snippetCatalog(ids?: readonly string[]): string {
    const caps = ids ? ids.map((id) => this.capabilities.get(id)).filter(Boolean) : this.list();
    return (caps as Capability[]).map((c) => `${c.id} — ${c.snippet}`).join('\n');
  }

  /** Tier 3 docs, if the implementation has any. */
  docsFor(implementationId: string): string | undefined {
    return this.executors.get(implementationId)?.implementation.docs;
  }
}
