/** Sample spaces data for the Spaces stories. */

import {
  SpaceResolutionSource,
  SpaceRuleKind,
  type ProductLine,
  type Space,
  type SpaceRule,
} from '@shepai/core/domain/generated/output';
import type { SpacesOverview } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import type { RunSpaceAction } from './spaces-types';

const T = new Date('2026-10-01T00:00:00Z');

export const PERSONAL: Space = {
  id: 'space-personal',
  name: 'Personal',
  slug: 'personal',
  description: 'Side projects and open source',
  isDefault: true,
  createdAt: T,
  updatedAt: T,
};

export const ACME: Space = {
  id: 'space-acme',
  name: 'Acme',
  slug: 'acme',
  description: 'Client work for Acme Corp',
  color: '#3456c4',
  isDefault: false,
  createdAt: T,
  updatedAt: T,
};

export const PAYMENTS: ProductLine = {
  id: 'line-payments',
  spaceId: ACME.id,
  name: 'Payments',
  slug: 'payments',
  createdAt: T,
  updatedAt: T,
};

export const PLATFORM: ProductLine = {
  id: 'line-platform',
  spaceId: ACME.id,
  name: 'Platform',
  slug: 'platform',
  createdAt: T,
  updatedAt: T,
};

export const ACME_RULES: SpaceRule[] = [
  {
    id: 'rule-remote',
    spaceId: ACME.id,
    kind: SpaceRuleKind.Remote,
    pattern: 'github.com/acme/*',
    priority: 100,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'rule-payments',
    spaceId: ACME.id,
    productLineId: PAYMENTS.id,
    kind: SpaceRuleKind.Remote,
    pattern: 'github.com/acme/pay-*',
    priority: 100,
    createdAt: T,
    updatedAt: T,
  },
];

export const OVERVIEW: SpacesOverview = {
  spaces: [
    { space: PERSONAL, productLines: [], rules: [], memoryCount: 6, repositoryCount: 2 },
    {
      space: ACME,
      productLines: [PAYMENTS, PLATFORM],
      rules: ACME_RULES,
      memoryCount: 14,
      repositoryCount: 2,
    },
  ],
  repositories: [
    {
      repositoryPath: '/home/dev/code/blog',
      name: 'blog',
      spaceId: PERSONAL.id,
      source: SpaceResolutionSource.Default,
    },
    {
      repositoryPath: '/home/dev/work/pay-api',
      name: 'pay-api',
      spaceId: ACME.id,
      productLineId: PAYMENTS.id,
      source: SpaceResolutionSource.Rule,
      ruleId: 'rule-payments',
    },
    {
      repositoryPath: '/home/dev/work/design-system',
      name: 'design-system',
      spaceId: ACME.id,
      source: SpaceResolutionSource.Rule,
      ruleId: 'rule-remote',
    },
    {
      repositoryPath: '/home/dev/oss/fork',
      name: 'fork',
      spaceId: PERSONAL.id,
      source: SpaceResolutionSource.Assignment,
    },
  ],
};

/** A RunSpaceAction for stories: runs the (mocked) action and reports success. */
export const runInStory: RunSpaceAction = async (action) => (await action()).ok;
