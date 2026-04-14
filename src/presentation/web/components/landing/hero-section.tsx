import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const HEADLINE = 'Ship features 10x faster with parallel AI agents';

const PAIN_STATEMENT =
  'One AI agent session is fine. Five is chaos — context switching, branch conflicts, stale worktrees, forgotten CI runs.';

const VALUE_PROP =
  'Shep gives each feature its own isolated world — a git worktree, a branch, an agent session — and handles committing, pushing, opening PRs, watching CI, and fixing failures.';

export function HeroSection() {
  return (
    <section className="flex flex-col items-center gap-8 px-4 py-16 text-center md:py-24">
      <p className="text-muted-foreground max-w-2xl text-lg">{PAIN_STATEMENT}</p>
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
        {HEADLINE}
      </h1>
      <p className="text-muted-foreground max-w-2xl text-lg md:text-xl">{VALUE_PROP}</p>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Button size="lg" asChild>
          <a href="https://github.com/shep-ai/shep" target="_blank" rel="noopener noreferrer">
            Get Started
            <ArrowRight />
          </a>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <a href="/why-shep">Why Shep?</a>
        </Button>
      </div>

      <div className="bg-muted/50 mt-4 overflow-hidden rounded-xl border p-2">
        <code className="text-muted-foreground text-sm">npx @shepai/cli</code>
      </div>
    </section>
  );
}
