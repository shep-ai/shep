/**
 * /aspm/ai-review — AI Change Review Queue
 *
 * Feature 098, phase 8 (task-51). Server component that fetches the open
 * AiChangeRiskSignal queue via the list-ai-signals use case and renders
 * it with the AiReviewQueue client island. The queue itself wires the
 * graduate / dismiss buttons to the HTTP endpoints landing in phase 10.
 */

import type { ListAiSignalsUseCase } from '@shepai/core/application/use-cases/aspm/ai-review/list-ai-signals';
import type { AiChangeRiskSignal } from '@shepai/core/domain/generated/output';

import { resolve } from '@/lib/server-container';
import { AiReviewQueue } from '@/components/features/aspm/ai-review-queue';

export const dynamic = 'force-dynamic';

export default async function AiReviewPage() {
  let signals: AiChangeRiskSignal[] = [];
  let error: string | null = null;
  try {
    signals = await resolve<ListAiSignalsUseCase>('ListAiSignalsUseCase').execute();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI change review</h1>
        <p className="text-muted-foreground text-sm">
          Triage queue for risk introduced by AI-generated changes. Confirmed signals graduate into
          the unified findings backlog; false positives can be dismissed with a justification
          preserved in the audit trail.
        </p>
      </header>

      <section aria-labelledby="ai-review-queue-heading" className="flex flex-col gap-2">
        <h2 id="ai-review-queue-heading" className="text-sm font-semibold tracking-wide uppercase">
          Open signals ({signals.length})
        </h2>
        <AiReviewQueue signals={signals} error={error} />
      </section>
    </div>
  );
}
