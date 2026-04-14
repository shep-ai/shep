import { FeatureCards } from '@/components/landing/feature-cards';
import { TrustSignals } from '@/components/landing/trust-signals';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const COMPARISON = [
  {
    manual: 'Switch branches, stash changes, lose context',
    shep: 'Each feature in its own worktree — zero conflicts',
  },
  {
    manual: 'Manually watch CI, copy error logs, re-run agent',
    shep: 'CI watch loop catches failures and fixes them automatically',
  },
  {
    manual: 'Assemble commits, write PR descriptions, push branches',
    shep: 'Auto-commit, auto-push, auto-PR with one command',
  },
  {
    manual: 'One agent session at a time, sequential feature work',
    shep: '3-5 features in parallel, each with its own agent',
  },
] as const;

export default function WhyShepPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-4 text-center text-3xl font-bold tracking-tight md:text-4xl">Why Shep?</h1>
      <p className="text-muted-foreground mb-12 text-center text-lg">
        You are already using AI coding agents. The problem is not the coding — it is everything
        around it.
      </p>

      <FeatureCards />

      <section className="py-12">
        <h2 className="mb-8 text-center text-2xl font-bold">Shep vs Manual Agent Management</h2>
        <div className="space-y-4">
          {COMPARISON.map((row) => (
            <div
              key={row.manual}
              className="grid grid-cols-1 gap-2 rounded-lg border p-4 md:grid-cols-2 md:gap-4"
            >
              <div>
                <span className="text-muted-foreground text-xs font-medium uppercase">
                  Without Shep
                </span>
                <p className="text-muted-foreground mt-1 text-sm">{row.manual}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-green-600 uppercase dark:text-green-400">
                  With Shep
                </span>
                <p className="mt-1 text-sm">{row.shep}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <TrustSignals />

      <div className="flex justify-center py-8">
        <Button size="lg" asChild>
          <a href="https://github.com/shep-ai/shep" target="_blank" rel="noopener noreferrer">
            Get Started
            <ArrowRight />
          </a>
        </Button>
      </div>
    </div>
  );
}
