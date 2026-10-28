'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Network } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { WEB_AUTH_TOKEN_FILENAME } from '@shepai/core/domain/shared/web-auth-token';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { errorMessage } from '@/lib/error-code';

/** Served by the daemon through a rewrite (next.config.ts) to /api/a2a/agent-card. */
export const AGENT_CARD_PATH = '/.well-known/agent-card.json';
const COPIED_RESET_MS = 2000;
const WINDOWS_SEPARATOR = '\\';
const POSIX_SEPARATOR = '/';
const SAMPLE_REQUEST_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'ListTasks',
  params: {},
});

/** The parts of the A2A agent card this section shows. */
export interface AgentCardSummary {
  version: string;
  documentationUrl?: string;
  supportedInterfaces: { url: string; protocolVersion: string }[];
}

export interface A2aIntegrationSectionProps {
  /** The shep home directory (SHEP_HOME), as the server resolved it. */
  shepHome: string;
}

/** `dir` + file with the separator `dir` already uses, so Windows paths read right. */
function joinDisplayPath(dir: string, file: string): string {
  const separator = dir.includes(WINDOWS_SEPARATOR) ? WINDOWS_SEPARATOR : POSIX_SEPARATOR;
  return dir.endsWith(separator) ? `${dir}${file}` : `${dir}${separator}${file}`;
}

function sampleRequest(endpoint: string, tokenPath: string): string {
  return [
    `curl -s ${endpoint} \\`,
    `  -H "Authorization: Bearer $(cat '${tokenPath}')" \\`,
    `  -H 'Content-Type: application/json' -H 'A2A-Version: 1.0' \\`,
    `  -d '${SAMPLE_REQUEST_BODY}'`,
  ].join('\n');
}

function useAgentCard(): { card?: AgentCardSummary; error: string | null } {
  const [card, setCard] = useState<AgentCardSummary>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(AGENT_CARD_PATH, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
        return (await response.json()) as AgentCardSummary;
      })
      .then((loaded) => live && setCard(loaded))
      .catch((caught: unknown) => live && setError(errorMessage(caught)));
    return () => {
      live = false;
    };
  }, []);
  return { card, error };
}

function CopyBlock({ label, value, testId }: { label: string; value: string; testId: string }) {
  const { t } = useTranslation('web');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t('agentActivity.connect.copied'));
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toast.error(t('agentActivity.connect.copyFailed'));
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label={t('agentActivity.connect.copyLabel', { label })}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <pre
        data-testid={testId}
        className="bg-muted overflow-x-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed whitespace-pre"
      >
        {value}
      </pre>
    </div>
  );
}

/**
 * Settings → Connect agents (spec 148): how another agent system reaches this
 * install over A2A, plus the terminal surfaces (Herdr, `shep feat`). The
 * endpoint comes from the agent card itself, so the page shows exactly what an
 * orchestrator will read; the token is named by its file, never shown.
 */
export function A2aIntegrationSection({ shepHome }: A2aIntegrationSectionProps) {
  const { t } = useTranslation('web');
  const { card, error } = useAgentCard();
  const endpoint = card?.supportedInterfaces[0]?.url;
  const tokenPath = joinDisplayPath(shepHome, WEB_AUTH_TOKEN_FILENAME);

  return (
    <Card id="a2a" className="scroll-mt-6" data-testid="a2a-integration-section">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Network className="text-muted-foreground h-4 w-4" />
          <CardTitle>{t('agentActivity.connect.title')}</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {t('agentActivity.connect.badge')}
          </Badge>
        </div>
        <CardDescription>{t('agentActivity.connect.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <span className="text-muted-foreground font-medium">
            {t('agentActivity.connect.agentCard')}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <a
              href={AGENT_CARD_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 font-mono hover:underline"
            >
              {AGENT_CARD_PATH}
              <ExternalLink aria-hidden className="size-3" />
            </a>
            {card ? (
              <Badge variant="outline" className="text-[10px]" data-testid="a2a-card-version">
                {t('agentActivity.connect.cardVersion', { version: card.version })}
              </Badge>
            ) : null}
          </span>

          <span className="text-muted-foreground font-medium">
            {t('agentActivity.connect.endpoint')}
          </span>
          {error ? (
            <span data-testid="a2a-card-error" className="text-destructive">
              {t('agentActivity.connect.cardError', { error })}
            </span>
          ) : (
            <code data-testid="a2a-endpoint" className="font-mono break-all">
              {endpoint ?? '…'}
            </code>
          )}

          <span className="text-muted-foreground font-medium">
            {t('agentActivity.connect.token')}
          </span>
          <span className="space-y-1">
            <code data-testid="a2a-token-path" className="block font-mono break-all">
              {tokenPath}
            </code>
            <span className="text-muted-foreground block">
              {t('agentActivity.connect.tokenHelp')}
            </span>
          </span>
        </div>

        {endpoint ? (
          <CopyBlock
            label={t('agentActivity.connect.request')}
            value={sampleRequest(endpoint, tokenPath)}
            testId="a2a-request"
          />
        ) : null}

        <Separator />

        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <span className="text-muted-foreground font-medium">
            {t('agentActivity.connect.herdr')}
          </span>
          <span>{t('agentActivity.connect.herdrHelp')}</span>
          <span className="text-muted-foreground font-medium">
            {t('agentActivity.connect.cli')}
          </span>
          <span>{t('agentActivity.connect.cliHelp')}</span>
        </div>

        {card?.documentationUrl ? (
          <a
            href={card.documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            {t('agentActivity.connect.guide')}
            <ExternalLink aria-hidden className="size-3" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
