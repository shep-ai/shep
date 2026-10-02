/**
 * ListHarnessCapabilitiesUseCase (spec 119): the tiered tool catalog — what
 * the model sees at Tier 1 (snippets) and what loads at Tier 2 (schemas).
 */
import { inject, injectable } from 'tsyringe';
import type { Capability, ToolImplementation } from '../../../domain/generated/output.js';
import { HARNESS_TOKENS, type IToolSource } from '../../ports/output/harness/index.js';
import { CapabilityRegistry } from '../../services/harness/capability-registry.js';
import { estimateTokens } from '../../../domain/harness/fingerprints.js';

export interface HarnessCapabilityItem {
  capability: Capability;
  implementations: ToolImplementation[];
  /** Tokens the Tier-1 snippet costs in every call. */
  snippetTokens: number;
  /** Tokens the Tier-2 schemas cost once loaded. */
  schemaTokens: number;
}

@injectable()
export class ListHarnessCapabilitiesUseCase {
  constructor(@inject(HARNESS_TOKENS.ToolSources) private readonly sources: IToolSource[]) {}

  async execute(): Promise<HarnessCapabilityItem[]> {
    const registry = await CapabilityRegistry.fromSources(this.sources);
    return registry.list().map((capability) => {
      const implementations = registry.implementations(capability.id);
      return {
        capability,
        implementations,
        snippetTokens: estimateTokens(capability.snippet),
        schemaTokens: implementations.reduce(
          (n, i) => n + estimateTokens(JSON.stringify(i.inputSchema)),
          0
        ),
      };
    });
  }
}
