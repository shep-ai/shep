# TUI Architecture

Architecture patterns for the Shep AI terminal UI layer.

## Design Principles

1. **CLI-integrated**: Wizards are invoked from CLI commands, not standalone
2. **Composable prompts**: Each prompt is a reusable configuration, wizards compose them into flows
3. **Fallback to non-interactive**: Every wizard supports `--flags` for CI/scripting bypass
4. **Consistent theming**: All prompts use the Shep theme for colors and symbols

## Wizard Pattern

A wizard is an async function that orchestrates multiple prompts into a multi-step flow:

```typescript
// src/presentation/tui/wizards/agent-config.wizard.ts
import { select, confirm, password } from '@inquirer/prompts';

export interface AgentConfigResult {
  agentType: string;
  authMethod: string;
  token?: string;
}

export async function agentConfigWizard(): Promise<AgentConfigResult> {
  // Step 1: Select agent
  const agentType = await select({ ... });

  // Step 2: Select auth method
  const authMethod = await select({ ... });

  // Step 3: If token, get token
  if (authMethod === 'token') {
    const token = await password({ ... });
    return { agentType, authMethod, token };
  }

  return { agentType, authMethod };
}
```

## Integration with CLI Commands

CLI commands detect whether to run interactive or non-interactive mode:

```typescript
// In command handler
if (options.agent && options.auth) {
  // Non-interactive: use flags directly
  result = { agentType: options.agent, authMethod: options.auth };
} else {
  // Interactive: launch wizard
  result = await agentConfigWizard();
}
```

## Prompt Configuration Pattern

Reusable prompt configurations are extracted to separate files:

```typescript
// src/presentation/tui/prompts/agent-select.prompt.ts
import { Separator } from '@inquirer/prompts';

export const agentSelectConfig = {
  message: 'Select your AI coding agent',
  choices: [
    { name: 'Claude Code', value: 'claude-code', description: '...' },
    { name: 'Gemini CLI', value: 'gemini-cli', description: 'Google Gemini CLI agent' },
    new Separator('--- Tracked in shep-ai/shep#618 ---'),
    { name: 'Aider', value: 'aider', disabled: '(tracked in shep-ai/shep#618)' },
    { name: 'Continue', value: 'continue', disabled: '(tracked in shep-ai/shep#618)' },
  ],
};
```

## Theming

Custom Inquirer theme integrates with the CLI design system colors:

```typescript
// src/presentation/tui/themes/shep.theme.ts
import { colors } from '@/presentation/cli/ui';

export const shepTheme = {
  prefix: { idle: colors.brand('?'), done: colors.success('✓') },
  style: {
    highlight: (text: string) => colors.brand(text),
    disabled: (text: string) => colors.muted(text),
  },
};
```

## Directory Structure

```
src/presentation/tui/
├── index.ts                    # Barrel exports
├── wizards/                    # Multi-step wizard flows
│   ├── agent-config.wizard.ts  # Agent selection + auth config
│   ├── merge-review.wizard.ts  # Merge/PR review flow
│   ├── plan-review.wizard.ts   # Plan review flow
│   ├── prd-review.wizard.ts    # PRD review flow
│   └── onboarding/             # First-run onboarding wizard
│       ├── onboarding.wizard.ts
│       ├── types.ts
│       └── steps/
│           ├── agent.step.ts
│           ├── ide.step.ts
│           └── workflow-defaults.step.ts
├── prompts/                    # Reusable prompt configurations
│   ├── agent-select.prompt.ts
│   ├── auth-method.prompt.ts
│   ├── ide-select.prompt.ts
│   ├── prd-review-question.prompt.ts
│   └── prd-review-summary.prompt.ts
└── themes/                     # Custom Inquirer themes
    └── shep.theme.ts
```

## Testing Strategy

- **Unit tests**: Mock `@inquirer/prompts` imports, test wizard logic and result mapping
- **Integration tests**: Test CLI command with `--flag` bypass (non-interactive)
- **E2E tests**: Use expect/spawn patterns for interactive terminal testing (future)
