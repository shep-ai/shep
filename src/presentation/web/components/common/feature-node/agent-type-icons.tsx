import type { ComponentType, SVGProps } from 'react';
import type { AgentType } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { createBrandIcon } from '@/components/common/brand-icon';

/**
 * Agent type values.
 *
 * This was a hand-written union that "mirrored" the TypeSpec AgentType enum and
 * had to be edited every time an agent was added. Aliasing the generated enum
 * makes drift impossible — and because the maps below are total `Record`s over
 * it, a new agent is a compile error here until it has an icon and a label.
 */
export type AgentTypeValue = `${AgentType}`;

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

/** Fallback icon when agent type is unknown or undefined. */
export function DefaultAgentIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

/** Colorful flask icon for the Demo Executor agent. */
function DevAgentIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-6 w-6', className)}
      {...(props as object)}
    >
      <defs>
        <linearGradient
          id="dev-flask-grad"
          x1="6"
          y1="22"
          x2="18"
          y2="8"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* Flask body */}
      <path
        d="M9 2h6v6l4.5 9a2 2 0 0 1-1.79 2.89H6.29A2 2 0 0 1 4.5 17L9 8V2z"
        fill="url(#dev-flask-grad)"
        opacity="0.9"
      />
      {/* Flask neck outline */}
      <path
        d="M9 2h6v6l4.5 9a2 2 0 0 1-1.79 2.89H6.29A2 2 0 0 1 4.5 17L9 8V2z"
        stroke="url(#dev-flask-grad)"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Bubbles */}
      <circle cx="10" cy="14" r="1.2" fill="white" opacity="0.7" />
      <circle cx="13.5" cy="16" r="0.8" fill="white" opacity="0.5" />
      <circle cx="11.5" cy="17.5" r="0.6" fill="white" opacity="0.4" />
      {/* Spark */}
      <path d="M16 4l1-2 1 2-2 1 2 1-1 2-1-2-2-1z" fill="#F59E0B" />
    </svg>
  );
}
DevAgentIcon.displayName = 'DevAgentIcon';

/** Layered-stack icon for the Shep Harness: state projected into one model call. */
function ShepHarnessIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-6 w-6', className)}
      {...(props as object)}
    >
      <path
        d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m3 12 9 4.5 9-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="m3 16.5 9 4.5 9-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.4"
      />
    </svg>
  );
}
ShepHarnessIcon.displayName = 'ShepHarnessIcon';

const agentTypeIconMap: Record<AgentTypeValue, ComponentType<IconProps>> = {
  'claude-code': createBrandIcon('/icons/agents/claude-ai-icon.svg', 'Claude Code'),
  'kimi-code': createBrandIcon('/icons/agents/kimi.svg', 'Kimi Code', true),
  'codex-cli': createBrandIcon('/icons/agents/openai.svg', 'Codex CLI', true),
  'copilot-cli': createBrandIcon('/icons/agents/copilot.svg', 'Copilot CLI', true),
  cursor: createBrandIcon('/icons/agents/cursor.jpeg', 'Cursor'),
  cline: createBrandIcon('/icons/agents/cline.svg', 'Cline', true),
  'gemini-cli': createBrandIcon('/icons/agents/gemini.svg', 'Gemini CLI', true),
  aider: createBrandIcon('/icons/agents/aider.png', 'Aider'),
  continue: createBrandIcon('/icons/agents/continue.jpeg', 'Continue'),
  openrouter: createBrandIcon('/icons/agents/openrouter.svg', 'OpenRouter', true),
  'together-ai': createBrandIcon('/icons/agents/together-ai.svg', 'Together AI'),
  ollama: createBrandIcon('/icons/agents/ollama.svg', 'Ollama', true),
  llmproxy: createBrandIcon('/icons/agents/openai.svg', 'LLM Proxy', true),
  dev: DevAgentIcon,
  'shep-harness': ShepHarnessIcon,
};

/** Human-readable labels for agent types. */
export const agentTypeLabels: Record<AgentTypeValue, string> = {
  'claude-code': 'Claude Code',
  'kimi-code': 'Kimi Code',
  'codex-cli': 'Codex CLI',
  'copilot-cli': 'Copilot CLI',
  cursor: 'Cursor',
  cline: 'Cline',
  'gemini-cli': 'Gemini CLI',
  aider: 'Aider',
  continue: 'Continue',
  openrouter: 'OpenRouter',
  'together-ai': 'Together AI',
  ollama: 'Ollama',
  llmproxy: 'LLM Proxy',
  dev: 'Demo',
  'shep-harness': 'Shep Harness',
};

/** Resolve an agent type string to its corresponding icon component. */
export function getAgentTypeIcon(agentType?: string): ComponentType<IconProps> {
  if (agentType && agentType in agentTypeIconMap) {
    return agentTypeIconMap[agentType as AgentTypeValue];
  }
  return DefaultAgentIcon;
}
