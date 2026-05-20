# TUI Design System

Styling and UX patterns for Shep AI terminal prompts.

## Theme Integration

The TUI layer shares the CLI design system colors, ensuring visual consistency between command output and interactive prompts.

### Shep Theme

```typescript
import { colors, symbols } from '@/presentation/cli/ui';

export const shepTheme = {
  prefix: {
    idle: colors.brand('?'),
    done: colors.success(symbols.tick),
  },
  style: {
    highlight: (text: string) => colors.brand(text),
    disabled: (text: string) => colors.muted(text),
    description: (text: string) => colors.muted(text),
    answer: (text: string) => colors.accent(text),
  },
};
```

## Prompt Patterns

### Select with Disabled Options

Used for lists where some options are not yet available:

```typescript
import { select, Separator } from '@inquirer/prompts';

const choice = await select({
  message: 'Select your AI coding agent',
  choices: [
    { name: 'Claude Code', value: 'claude-code', description: 'Anthropic AI coding assistant' },
    { name: 'Cursor', value: 'cursor', description: 'Cursor AI coding agent' },
    { name: 'Gemini CLI', value: 'gemini-cli', description: 'Google Gemini CLI agent' },
    new Separator('─── Tracked in shep-ai/shep#618 ───'),
    { name: 'Aider', value: 'aider', disabled: '(tracked in shep-ai/shep#618)' },
    { name: 'Continue', value: 'continue', disabled: '(tracked in shep-ai/shep#618)' },
  ],
  theme: shepTheme,
});
```

### Masked Password Input

Used for sensitive data like API tokens:

```typescript
import { password } from '@inquirer/prompts';

const token = await password({
  message: 'Enter your API token',
  mask: '*',
  theme: shepTheme,
});
```

### Confirmation

Used before destructive or irreversible operations:

```typescript
import { confirm } from '@inquirer/prompts';

const proceed = await confirm({
  message: 'Overwrite existing agent configuration?',
  default: false,
  theme: shepTheme,
});
```

## UX Guidelines

1. **Clear messages**: Prompt messages should be concise action-oriented questions
2. **Descriptions**: Use `description` field on select choices to provide context
3. **Disabled feedback**: Always include a reason string for disabled options (e.g., `'(tracked in shep-ai/shep#618)'`)
4. **Separators**: Use separators to visually group related options
5. **Defaults**: Set sensible defaults to minimize keystrokes for common paths
6. **Masking**: Always mask sensitive inputs (tokens, passwords)
7. **Confirmation**: Prompt before overwriting existing configuration

## Color Mapping

| Element                   | Color            | CLI Equivalent   |
| ------------------------- | ---------------- | ---------------- |
| Active/highlighted option | `colors.brand`   | Brand blue       |
| Disabled option text      | `colors.muted`   | Dim gray         |
| Description text          | `colors.muted`   | Dim gray         |
| Success prefix            | `colors.success` | Green            |
| Selected answer           | `colors.accent`  | Cyan             |
| Separator                 | Default          | Terminal default |

---

## Maintaining This Document

**Update when:**

- New prompt patterns are introduced
- Theme colors or symbols change
- UX guidelines evolve
