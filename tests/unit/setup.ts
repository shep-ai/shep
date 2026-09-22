/**
 * Global test setup for the node vitest project.
 *
 * Initializes CLI and TUI i18n so that any test importing
 * presentation-layer modules has translation functions available.
 */

import { initI18n as initCliI18n } from '../../src/presentation/cli/i18n.js';
import { initI18n as initTuiI18n } from '../../src/presentation/tui/i18n.js';
import {
  AGENT_FEATURE_ID_ENV_VAR,
  AGENT_RUN_ID_ENV_VAR,
} from '../../packages/core/src/domain/shared/agent-run-environment.js';

await Promise.all([initCliI18n('en'), initTuiI18n('en')]);

// Shep develops itself with its own agents, so this suite often runs inside a
// feature worker whose environment carries the agent-run marker. Left in place,
// every `shep stop` / `restart` / `upgrade` / `agent stop` test would take the
// "refuse: you are inside an agent run" branch. Tests that exercise that branch
// set the marker themselves.
delete process.env[AGENT_RUN_ID_ENV_VAR];
delete process.env[AGENT_FEATURE_ID_ENV_VAR];
