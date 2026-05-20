'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PromptEditor, type PromptEditorEntry } from './prompt-editor';
import { AgentGraphView, type AgentGraphDescriptor } from './agent-graph-view';
import { AgentPlayground } from './agent-playground';

export interface AgentEditorTabsProps {
  agentType: string;
  prompts: PromptEditorEntry[];
  graph: AgentGraphDescriptor | null;
  bundledGraph?: AgentGraphDescriptor | null;
  hasGraphOverride?: boolean;
}

export function AgentEditorTabs({
  agentType,
  prompts,
  graph,
  bundledGraph,
  hasGraphOverride,
}: AgentEditorTabsProps) {
  const [selectedPromptId, setSelectedPromptId] = useState<string>(
    prompts[0]?.promptId ?? 'evaluator.system'
  );
  const selectedPrompt = prompts.find((p) => p.promptId === selectedPromptId);

  const { t } = useTranslation('web');

  return (
    <Tabs defaultValue="prompts" data-testid="agent-editor-tabs">
      <TabsList>
        <TabsTrigger value="prompts">{t('agentEditor.prompts')}</TabsTrigger>
        <TabsTrigger value="graph">{t('agentEditor.graph')}</TabsTrigger>
        <TabsTrigger value="playground">{t('agentEditor.playground')}</TabsTrigger>
      </TabsList>

      <TabsContent value="prompts" className="mt-4">
        <PromptEditor entries={prompts} />
      </TabsContent>

      <TabsContent value="graph" className="mt-4">
        <AgentGraphView
          graph={graph}
          bundled={bundledGraph ?? null}
          hasOverride={hasGraphOverride ?? false}
        />
      </TabsContent>

      <TabsContent value="playground" className="mt-4 flex flex-col gap-3">
        {prompts.length > 1 ? (
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="playground-prompt-select" className="text-muted-foreground">
              Use prompt:
            </label>
            <select
              id="playground-prompt-select"
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              className="border-border bg-background rounded border px-2 py-1 text-xs"
              data-testid="playground-prompt-select"
            >
              {prompts.map((p) => (
                <option key={p.promptId} value={p.promptId}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <AgentPlayground
          agentType={agentType}
          promptId={selectedPromptId}
          {...(selectedPrompt?.hasOverride && { inlinePromptBody: selectedPrompt.effectiveBody })}
        />
      </TabsContent>
    </Tabs>
  );
}
