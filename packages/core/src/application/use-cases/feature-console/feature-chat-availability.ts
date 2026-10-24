/**
 * Whether a feature chat can run (spec 147): the interactive agent can be
 * turned off in settings, as the web hides its Chat tab then.
 */

import type { ISettingsProvider } from '../../ports/output/services/settings-provider.interface.js';

const DISABLED_REASON = 'The interactive agent is turned off in settings.';

/** Why chat is unavailable, or undefined when it can run. */
export function interactiveAgentDisabledReason(settings: ISettingsProvider): string | undefined {
  if (!settings.has()) return undefined;
  return settings.get().interactiveAgent?.enabled === false ? DISABLED_REASON : undefined;
}
