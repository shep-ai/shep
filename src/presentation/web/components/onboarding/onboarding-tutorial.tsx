'use client';

/**
 * OnboardingTutorial
 *
 * In-app walkthrough for the new collaboration & supervision features.
 * Pure presentation — every step links to the live surface so the user
 * can flip between reading and trying. Sections are independently
 * collapsible so revisiting users can jump straight to the part they
 * want.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface TutorialStep {
  title: string;
  description: string;
  detail?: string;
  cta?: { label: string; href: string };
}

interface TutorialSection {
  id: string;
  icon: LucideIcon;
  badge?: string;
  title: string;
  intro: string;
  steps: TutorialStep[];
}

const SECTIONS: TutorialSection[] = [
  {
    id: 'supervisors',
    icon: ShieldCheck,
    badge: 'Supervision',
    title: 'Supervisors keep agents on the rails',
    intro:
      'A supervisor is a small agent that watches another agent and decides whether to approve, advise, escalate, or reject what it tries to do. Policies cascade — feature beats repo beats application beats global.',
    steps: [
      {
        title: 'Open the supervisor dashboard',
        description:
          'Lists every configured policy grouped by scope and the most recent decisions across all of them.',
        detail:
          'You will land on an empty state the first time. The buttons there jump straight into pick-an-application or edit-agent-prompts so the page is never a dead end.',
        cta: { label: 'Open /supervisor', href: '/supervisor' },
      },
      {
        title: 'Create your first supervisor',
        description:
          'Click "Create supervisor" at the top right. Pick the scope you want to watch (global, application, repository, or per-feature override), then choose an autonomy level.',
        detail:
          'Advisory recommends only — safest default. Co-sign requires both supervisor and user to approve a gate. Autonomous lets the supervisor act on your behalf within the policy you configure.',
      },
      {
        title: 'Tune per-gate authority',
        description:
          'For each gate (PRD, Plan, Merge) you can override the global autonomy level. A merge gate set to Co-sign while everything else is Advisory is a common starter setup.',
      },
      {
        title: 'Inspect decisions',
        description:
          'Once your supervisor evaluates an event, the rationale + verdict shows up in the Recent decisions list. Click "Why?" on any row to see the full audit trail.',
      },
      {
        title: 'Promoted on the application page',
        description:
          'Every application top-bar now has a Configure supervisor button that takes you straight to the per-app policy editor.',
      },
    ],
  },
  {
    id: 'agents',
    icon: Bot,
    badge: 'Agents',
    title: 'Edit prompts, graphs, and try them in the playground',
    intro:
      'The Agents page lists every built-in agent (feature-agent, supervisor-agent) plus any custom agents you create. Each one has three tabs: Prompts, Graph, and Playground.',
    steps: [
      {
        title: 'Open the agent list',
        description:
          'You will see one row per registered agent with its prompt count and override count. Click any row to open the editor.',
        cta: { label: 'Open /agents', href: '/agents' },
      },
      {
        title: 'Edit a prompt slot',
        description:
          'Each agent has one or more system-prompt slots. Save an override and it replaces the bundled body at runtime; click "Reset to bundled" to restore the byte-identical default.',
        detail:
          'Overrides are versioned — every save bumps the version counter so the audit trail tells you exactly which prompt was in effect when an action ran.',
      },
      {
        title: 'Edit the graph (write capability)',
        description:
          'Open the Graph tab and click Edit. Drag nodes to rearrange, drag from a node handle to connect, double-click a label to rename, and Backspace to delete. Save or Reset to bundled to roll back.',
        detail:
          'Nodes and edges are stored as a JSON descriptor — a structural override of the LangGraph topology shipped with the runtime.',
      },
      {
        title: 'Try it in the playground',
        description:
          'The Playground tab streams a live chat against the configured executor with the current (possibly unsaved) prompt body so you can A/B before saving.',
        detail:
          'Playground runs are isolated — they never touch agent_runs, agent_messages, or supervisor_decisions tables.',
      },
    ],
  },
  {
    id: 'custom-agents',
    icon: Sparkles,
    badge: 'Custom agents',
    title: 'Stand up a brand-new agent type',
    intro:
      'Custom agents share the same prompt + graph + playground surfaces as built-ins. Use them when you want a new agent type the runtime does not ship with — code review, doc rewriting, whatever.',
    steps: [
      {
        title: 'Click "New agent" on /agents',
        description:
          'Pick a stable kebab-case id (e.g. code-review), a display name, a description, and optionally seed the first prompt slot.',
        cta: { label: 'Open /agents', href: '/agents' },
      },
      {
        title: 'Author more prompt slots',
        description:
          'Once created, the agent opens in the editor. Add as many prompt slots as you need — custom agents accept any slot id you invent (built-ins are locked to the registry).',
      },
      {
        title: 'Design the graph from scratch',
        description:
          'A custom agent starts with a single "Start" node so the editor is immediately useful. Add nodes, connect them, save — your topology is now persisted as an override.',
      },
      {
        title: 'Delete cleans up after itself',
        description:
          'Removing a custom agent cascades through prompt + graph overrides so nothing is left orphaned in the database. Built-ins cannot be deleted.',
      },
    ],
  },
  {
    id: 'where-to-find-things',
    icon: GraduationCap,
    badge: 'Discoverability',
    title: 'Where everything lives',
    intro: 'A quick map of the new surfaces and how to reach each.',
    steps: [
      {
        title: 'Sidebar — Supervisor / Agents / Get started',
        description:
          'All three live under the collaboration feature flag. If they are missing, enable the flag in Settings.',
      },
      {
        title: 'Application top-bar — Configure supervisor',
        description:
          'Lands you on /application/[id]/supervisor with the per-app policy form pre-loaded.',
      },
      {
        title: 'Per-feature override',
        description:
          'On the supervisor dashboard, the "Per-feature overrides" group surfaces every policy that targets a single feature. Use the Create dialog and pick scope = feature to add one.',
      },
    ],
  },
];

export function OnboardingTutorial() {
  const { t } = useTranslation('web');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="flex flex-col gap-8" data-testid="onboarding-tutorial">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-primary size-6" />
          <h1 className="text-2xl font-semibold">
            {t('onboarding.tutorial.title', { defaultValue: 'Get started' })}
          </h1>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">
          {t('onboarding.tutorial.description', {
            defaultValue:
              'A short tour through the new agent collaboration & supervision features. Each section links to the live surface — read for two minutes, then go try it.',
          })}
        </p>
      </header>

      <nav
        className="bg-muted/40 flex flex-wrap gap-2 rounded-lg border p-3"
        aria-label={t('onboarding.tutorial.sectionsNavLabel', {
          defaultValue: 'Tutorial sections',
        })}
      >
        {SECTIONS.map((section) => {
          const title = t(`onboarding.tutorial.sections.${section.id}.title`, {
            defaultValue: section.title,
          });
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border bg-white/40 px-3 py-1.5 text-xs font-medium dark:bg-black/20"
            >
              <section.icon className="size-3" />
              {title.split('—')[0]?.trim() ?? title}
            </a>
          );
        })}
      </nav>

      {SECTIONS.map((section) => {
        const sectionKey = `onboarding.tutorial.sections.${section.id}`;
        return (
          <section
            key={section.id}
            id={section.id}
            data-testid={`tutorial-section-${section.id}`}
            className="flex scroll-mt-6 flex-col gap-4"
          >
            <header className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <section.icon className="text-primary size-5" />
                  <h2 className="text-lg font-semibold">
                    {t(`${sectionKey}.title`, { defaultValue: section.title })}
                  </h2>
                  {section.badge ? (
                    <Badge variant="secondary" className="shrink-0">
                      {t(`${sectionKey}.badge`, { defaultValue: section.badge })}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground max-w-2xl text-sm">
                  {t(`${sectionKey}.intro`, { defaultValue: section.intro })}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggle(section.id)}
                aria-expanded={!collapsed[section.id]}
                aria-controls={`steps-${section.id}`}
                data-testid={`tutorial-toggle-${section.id}`}
              >
                {collapsed[section.id] ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
              </Button>
            </header>

            {collapsed[section.id] ? null : (
              <ol
                id={`steps-${section.id}`}
                className="flex flex-col gap-3 border-l-2 pl-5"
                data-testid={`tutorial-steps-${section.id}`}
              >
                {section.steps.map((step, i) => {
                  const stepKey = `${sectionKey}.steps.${i}`;
                  return (
                    <li key={step.title} className="flex flex-col gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-muted-foreground font-mono text-xs">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <h3 className="text-sm font-semibold">
                          {t(`${stepKey}.title`, { defaultValue: step.title })}
                        </h3>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {t(`${stepKey}.description`, { defaultValue: step.description })}
                      </p>
                      {step.detail ? (
                        <p className="text-muted-foreground/80 text-xs">
                          {t(`${stepKey}.detail`, { defaultValue: step.detail })}
                        </p>
                      ) : null}
                      {step.cta ? (
                        <div>
                          <Button asChild size="sm" variant="outline">
                            <Link href={step.cta.href as Route}>
                              {t(`${stepKey}.cta`, { defaultValue: step.cta.label })}
                              <ArrowRight className="size-3" />
                            </Link>
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}

      <footer className="text-muted-foreground bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
        {t('onboarding.tutorial.footer', {
          defaultValue:
            'Stuck on something? The whole stack is editable — every prompt, every graph, every autonomy level. Bumping a slot version is reversible: delete the override and the bundled default returns byte-for-byte.',
        })}
      </footer>
    </div>
  );
}
