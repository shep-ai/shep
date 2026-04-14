import { Badge } from '@/components/ui/badge';
import { Scale, HardDrive, Repeat, Rocket } from 'lucide-react';

const SIGNALS = [
  {
    icon: Scale,
    label: 'MIT Licensed',
    description: 'Fork it, sell it, do what you want',
  },
  {
    icon: HardDrive,
    label: '100% Local',
    description: 'All data in ~/.shep/ as SQLite. No cloud, no account',
  },
  {
    icon: Repeat,
    label: 'Agent-Agnostic',
    description: 'Use Claude Code, Cursor CLI, or Gemini CLI. Swap anytime',
  },
  {
    icon: Rocket,
    label: '185+ Releases',
    description: 'Actively maintained with continuous delivery',
  },
] as const;

export function TrustSignals() {
  return (
    <section className="px-4 py-12">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SIGNALS.map((signal) => (
          <div key={signal.label} className="flex flex-col items-center gap-2 text-center">
            <signal.icon className="text-muted-foreground size-6" />
            <Badge variant="secondary">{signal.label}</Badge>
            <p className="text-muted-foreground text-sm">{signal.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
