/**
 * Model Catalog Types
 *
 * Type definitions for dynamic model catalog entries returned by provider APIs.
 * CatalogEntry is the normalized shape after fetching from OpenRouter, Together AI, etc.
 */

import type { AgentModelListing } from './agent-executor-factory.interface.js';

/**
 * A single entry from a provider's model catalog.
 * Alias for AgentModelListing for backwards compatibility with the dynamic catalog feature.
 */
export type CatalogEntry = AgentModelListing;
