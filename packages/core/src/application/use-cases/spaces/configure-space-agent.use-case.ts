/**
 * ConfigureSpaceAgentUseCase (spec 121)
 *
 * Shows and changes a space's agent settings: the Claude and gh config
 * directories, the git identity, Bedrock and AWS profile, and the agent types
 * the space allows. A patch sets the fields it gives, clears the ones it sets
 * to null, and keeps the rest. Credentials are never stored; a space only
 * points at directories the tools manage their own logins in.
 */

import { injectable, inject } from 'tsyringe';
import {
  AgentType,
  type Space,
  type SpaceAgentSettings,
} from '../../../domain/generated/output.js';
import { isAbsolutePath } from '../../../domain/shared/absolute-path.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import {
  spaceEnvironment,
  type SpaceEnvironment,
} from '../../../domain/shared/space-environment.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import { failure, findSpace, type SpaceResult } from './space-refs.js';

/** A change to a space's agent settings: a value sets a field, null clears it. */
export type SpaceAgentSettingsPatch = {
  [K in keyof SpaceAgentSettings]?: SpaceAgentSettings[K] | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const AWS_PROFILE = /^[\w.+@-]+$/;
const AGENT_TYPES = new Set<string>(Object.values(AgentType));

type Validated<T> = { ok: true; value: T | undefined } | { ok: false; error: string };

function directory(label: string, value: string): Validated<string> {
  const path = normalizePath(value.trim()).replace(/\/+$/, '');
  if (!isAbsolutePath(path))
    return { ok: false, error: `${label} "${value}" is not an absolute path.` };
  return { ok: true, value: path };
}

function text(value: string): Validated<string> {
  const trimmed = value.trim();
  return { ok: true, value: trimmed === '' ? undefined : trimmed };
}

function validateField(
  key: keyof SpaceAgentSettings,
  value: NonNullable<SpaceAgentSettingsPatch[keyof SpaceAgentSettings]>
): Validated<SpaceAgentSettings[keyof SpaceAgentSettings]> {
  switch (key) {
    case 'claudeConfigDir':
      return directory('Claude config directory', value as string);
    case 'ghConfigDir':
      return directory('gh config directory', value as string);
    case 'gitAuthorName':
      return text(value as string);
    case 'gitAuthorEmail': {
      const email = (value as string).trim();
      return EMAIL.test(email)
        ? { ok: true, value: email }
        : { ok: false, error: `"${email}" is not an email address.` };
    }
    case 'awsProfile': {
      const profile = (value as string).trim();
      return AWS_PROFILE.test(profile)
        ? { ok: true, value: profile }
        : { ok: false, error: `"${profile}" is not an AWS profile name.` };
    }
    case 'useBedrock':
      return { ok: true, value: value as boolean };
    case 'allowedAgentTypes': {
      const types = [...new Set(value as AgentType[])];
      const unknown = types.find((type) => !AGENT_TYPES.has(type));
      if (unknown) return { ok: false, error: `"${unknown}" is not an agent type.` };
      return { ok: true, value: types.length > 0 ? types : undefined };
    }
  }
}

@injectable()
export class ConfigureSpaceAgentUseCase {
  constructor(@inject('ISpaceRepository') private readonly spaces: ISpaceRepository) {}

  /** A space with the environment its settings produce. */
  async show(ref: string): Promise<SpaceResult<{ space: Space; environment: SpaceEnvironment }>> {
    const space = await findSpace(this.spaces, ref);
    if (!space) return failure(`No space "${ref}".`);
    return { ok: true, space, environment: spaceEnvironment(space.agentSettings) };
  }

  async configure(
    ref: string,
    patch: SpaceAgentSettingsPatch
  ): Promise<SpaceResult<{ space: Space; environment: SpaceEnvironment }>> {
    const space = await findSpace(this.spaces, ref);
    if (!space) return failure(`No space "${ref}".`);

    const next: Record<string, unknown> = { ...space.agentSettings };
    for (const key of Object.keys(patch) as (keyof SpaceAgentSettings)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value === null) {
        delete next[key];
        continue;
      }
      const validated = validateField(key, value);
      if (!validated.ok) return failure(validated.error);
      if (validated.value === undefined) delete next[key];
      else next[key] = validated.value;
    }

    const agentSettings = next as SpaceAgentSettings;
    const { agentSettings: _previous, ...rest } = space;
    const updated: Space = {
      ...rest,
      ...(Object.keys(agentSettings).length > 0 ? { agentSettings } : {}),
      updatedAt: new Date(),
    };
    await this.spaces.update(updated);
    return { ok: true, space: updated, environment: spaceEnvironment(updated.agentSettings) };
  }
}
