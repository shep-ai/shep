'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Bot, Eye, EyeOff, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateSettingsAction } from '@/app/actions/update-settings';
import { AgentType, AgentAuthMethod } from '@shepai/core/domain/generated/output';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';
import type { AgentConfig } from '@shepai/core/domain/generated/output';

const AGENT_TYPE_OPTIONS = [
  { value: AgentType.ClaudeCode, label: 'Claude Code' },
  { value: AgentType.CodexCli, label: 'Codex CLI' },
  { value: AgentType.CopilotCli, label: 'Copilot CLI' },
  { value: AgentType.Cursor, label: 'Cursor' },
  { value: AgentType.GeminiCli, label: 'Gemini CLI' },
  { value: AgentType.Cline, label: 'Cline' },
  { value: AgentType.OpenRouter, label: 'OpenRouter' },
  { value: AgentType.TogetherAi, label: 'Together AI' },
  { value: AgentType.Ollama, label: 'Ollama' },
  { value: AgentType.Aider, label: 'Aider' },
  { value: AgentType.Continue, label: 'Continue' },
  { value: AgentType.Dev, label: 'Dev' },
];

/** Agent types that only support session-based auth (no API token). */
const SESSION_ONLY_AGENTS = new Set<AgentType>([AgentType.CopilotCli]);

/** Agent types that require token-based auth (API key only, no CLI binary). */
const TOKEN_REQUIRED_AGENTS = new Set<AgentType>([AgentType.OpenRouter, AgentType.TogetherAi]);

const AUTH_METHOD_OPTIONS = [
  { value: AgentAuthMethod.Session, label: 'Session' },
  { value: AgentAuthMethod.Token, label: 'Token' },
];

export interface AgentSettingsSectionProps {
  agent: AgentConfig;
}

export function AgentSettingsSection({ agent }: AgentSettingsSectionProps) {
  const [agentType, setAgentType] = useState(agent.type);
  const [authMethod, setAuthMethod] = useState(agent.authMethod);
  const [token, setToken] = useState(agent.token ?? '');
  const [showToken, setShowToken] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  function save(payload: { agent: AgentConfig }) {
    startTransition(async () => {
      const result = await updateSettingsAction(payload);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save agent settings');
      }
    });
  }

  function buildPayload(overrides: Partial<AgentConfig> = {}): { agent: AgentConfig } {
    const merged = { type: agentType, authMethod, ...overrides };
    const result: Record<string, unknown> = { type: merged.type, authMethod: merged.authMethod };
    if (merged.authMethod === AgentAuthMethod.Token) {
      result.token = overrides.token ?? token;
    }
    return { agent: result as AgentConfig };
  }

  function handleAgentTypeChange(value: string) {
    const newType = value as AgentType;
    let newAuthMethod = authMethod;
    if (SESSION_ONLY_AGENTS.has(newType)) {
      newAuthMethod = AgentAuthMethod.Session;
    } else if (TOKEN_REQUIRED_AGENTS.has(newType)) {
      newAuthMethod = AgentAuthMethod.Token;
    }
    setAgentType(newType);
    if (newAuthMethod !== authMethod) {
      setAuthMethod(newAuthMethod);
    }
    save(buildPayload({ type: newType, authMethod: newAuthMethod }));
  }

  function handleAuthMethodChange(value: string) {
    setAuthMethod(value as AgentAuthMethod);
    save(buildPayload({ authMethod: value as AgentAuthMethod }));
  }

  function handleTokenBlur() {
    if (token !== (agent.token ?? '')) {
      save(buildPayload({ token }));
    }
  }

  return (
    <Card id="agent" className="scroll-mt-6" data-testid="agent-settings-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="text-muted-foreground h-4 w-4" />
            <CardTitle>Preferred Agent</CardTitle>
          </div>
          {isPending ? <span className="text-muted-foreground text-xs">Saving...</span> : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null}
        </div>
        <CardDescription>Choose your AI coding agent and authentication method</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agent-type">Agent Type</Label>
          <Select value={agentType} onValueChange={handleAgentTypeChange}>
            <SelectTrigger id="agent-type" data-testid="agent-type-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_TYPE_OPTIONS.map((opt) => {
                const Icon = getAgentTypeIcon(opt.value);
                return (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      {opt.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="auth-method">Authentication Method</Label>
          <Select
            value={authMethod}
            onValueChange={handleAuthMethodChange}
            disabled={SESSION_ONLY_AGENTS.has(agentType) || TOKEN_REQUIRED_AGENTS.has(agentType)}
          >
            <SelectTrigger id="auth-method" data-testid="auth-method-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTH_METHOD_OPTIONS.filter((opt) => {
                if (SESSION_ONLY_AGENTS.has(agentType))
                  return opt.value === AgentAuthMethod.Session;
                if (TOKEN_REQUIRED_AGENTS.has(agentType))
                  return opt.value === AgentAuthMethod.Token;
                return true;
              }).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {SESSION_ONLY_AGENTS.has(agentType) && (
            <p className="text-muted-foreground text-xs">
              Copilot CLI uses GitHub OAuth — authenticate with{' '}
              <code className="font-mono">copilot auth login</code>. No API token needed.
            </p>
          )}
          {TOKEN_REQUIRED_AGENTS.has(agentType) && (
            <p className="text-muted-foreground text-xs">
              This provider requires an API key for authentication. No CLI binary needed.
            </p>
          )}
        </div>

        {authMethod === AgentAuthMethod.Token && (
          <div className="space-y-2">
            <Label htmlFor="agent-token">API Token</Label>
            <div className="relative">
              <Input
                id="agent-token"
                data-testid="agent-token-input"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onBlur={handleTokenBlur}
                placeholder="Enter your API token"
                className="pe-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowToken(!showToken)}
                data-testid="toggle-token-visibility"
                aria-label={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Saves automatically when you leave the field
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
