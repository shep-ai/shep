import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch, Bot, Eye, FileText } from 'lucide-react';

const FEATURES = [
  {
    icon: GitBranch,
    title: 'Parallel Execution',
    description:
      'Each feature runs in its own git worktree with its own agent. No branch conflicts, no stale context.',
  },
  {
    icon: Bot,
    title: 'Agent-Agnostic',
    description:
      'Works with Claude Code, Cursor CLI, and Gemini CLI. Swap agents without changing your workflow.',
  },
  {
    icon: Eye,
    title: 'CI Watch Loop',
    description:
      'Shep watches CI runs, catches failures, and fixes them automatically. You review the final PR.',
  },
  {
    icon: FileText,
    title: 'Spec-Driven',
    description:
      'Define requirements in structured specs. Shep plans, implements, tests, and submits — all from a single prompt.',
  },
] as const;

export function FeatureCards() {
  return (
    <section className="px-4 py-12">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
        {FEATURES.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <feature.icon className="text-primary size-5" />
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
