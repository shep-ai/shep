/** Shared setup for the opportunity use-case tests (spec 126). */

import type { Space } from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockProductLineRepository,
  createMockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';
import {
  InMemoryOpportunities,
  InMemoryOpportunityWeights,
  InMemorySignals,
} from '../../../../helpers/opportunity-repositories.mock.js';

export const ACME: Space = {
  ...DEFAULT_SPACE,
  id: 'space-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
};

export const PAYMENTS = {
  id: 'line-pay',
  spaceId: ACME.id,
  name: 'Payments',
  slug: 'payments',
  createdAt: DEFAULT_SPACE.createdAt,
  updatedAt: DEFAULT_SPACE.updatedAt,
};

export function opportunityWorld() {
  const spaces = createMockSpaceRepository();
  spaces.list.mockResolvedValue([DEFAULT_SPACE, ACME]);
  spaces.findById.mockImplementation(async (id: string) =>
    id === ACME.id ? ACME : id === DEFAULT_SPACE.id ? DEFAULT_SPACE : null
  );
  spaces.findBySlug.mockImplementation(async (slug: string) =>
    slug === 'acme' ? ACME : slug === 'default' ? DEFAULT_SPACE : null
  );
  const productLines = createMockProductLineRepository();
  productLines.findById.mockImplementation(async (id: string) =>
    id === PAYMENTS.id ? PAYMENTS : null
  );
  productLines.findBySlug.mockImplementation(async (spaceId: string, slug: string) =>
    spaceId === ACME.id && slug === 'payments' ? PAYMENTS : null
  );
  return {
    spaces,
    productLines,
    signals: new InMemorySignals(),
    opportunities: new InMemoryOpportunities(),
    weights: new InMemoryOpportunityWeights(),
  };
}
