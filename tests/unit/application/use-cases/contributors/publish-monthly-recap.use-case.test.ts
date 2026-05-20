import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { PublishMonthlyRecapUseCase } from '@/application/use-cases/contributors/publish-monthly-recap.use-case.js';
import { RecapChannel } from '@/domain/generated/output.js';
import type { IContributorActionGate } from '@/application/ports/output/services/contributor-action-gate.interface.js';
import type {
  IRecapPublisher,
  RecapArtifact,
  RecapTarget,
} from '@/application/ports/output/services/recap-publisher.interface.js';

const ARTIFACT: RecapArtifact = {
  recapId: '2026-04',
  title: 'Shep — 2026-04 contributor recap',
  body: '# Recap\n\nDetails...',
  periodStartIso: '2026-04-01T00:00:00.000Z',
};

function fakePublisher(channel: RecapChannel, behavior: 'ok' | 'throw'): IRecapPublisher {
  return {
    channel,
    publish: vi.fn().mockImplementation(async () => {
      if (behavior === 'throw') throw new Error(`${channel} blew up`);
      return { channel, reference: `${channel}-ref-1` };
    }),
  };
}

describe('PublishMonthlyRecapUseCase', () => {
  it('publishes through every approved channel and returns per-channel statuses', async () => {
    const filePub = fakePublisher(RecapChannel.File, 'ok');
    const discordPub = fakePublisher(RecapChannel.Discord, 'ok');
    const gate: IContributorActionGate = {
      gate: vi.fn().mockResolvedValue({ approved: true, rationale: 'ok' }),
    };
    const useCase = new PublishMonthlyRecapUseCase(gate, [filePub, discordPub]);

    const targets: RecapTarget[] = [
      { channel: RecapChannel.File },
      { channel: RecapChannel.Discord, channelId: 'C1' },
    ];
    const { outcomes } = await useCase.execute({ artifact: ARTIFACT, targets });

    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => o.status === 'published')).toBe(true);
    expect(filePub.publish).toHaveBeenCalledTimes(1);
    expect(discordPub.publish).toHaveBeenCalledTimes(1);
    expect(gate.gate).toHaveBeenCalledTimes(2);
  });

  it('reports denied channels without invoking the publisher', async () => {
    const filePub = fakePublisher(RecapChannel.File, 'ok');
    const discordPub = fakePublisher(RecapChannel.Discord, 'ok');
    const gate: IContributorActionGate = {
      gate: vi.fn().mockImplementation(async (input) => {
        if (input.kind === 'recap-publish-discord') {
          return { approved: false, rationale: 'human approval required' };
        }
        return { approved: true, rationale: 'auto-approved' };
      }),
    };
    const useCase = new PublishMonthlyRecapUseCase(gate, [filePub, discordPub]);

    const { outcomes } = await useCase.execute({
      artifact: ARTIFACT,
      targets: [{ channel: RecapChannel.File }, { channel: RecapChannel.Discord, channelId: 'C1' }],
    });

    expect(outcomes[0]).toMatchObject({ channel: RecapChannel.File, status: 'published' });
    expect(outcomes[1]).toMatchObject({ channel: RecapChannel.Discord, status: 'denied' });
    expect(discordPub.publish).not.toHaveBeenCalled();
  });

  it('does not let one publisher failure poison the others', async () => {
    const filePub = fakePublisher(RecapChannel.File, 'ok');
    const discordPub = fakePublisher(RecapChannel.Discord, 'throw');
    const gate: IContributorActionGate = {
      gate: vi.fn().mockResolvedValue({ approved: true, rationale: 'ok' }),
    };
    const useCase = new PublishMonthlyRecapUseCase(gate, [filePub, discordPub]);

    const { outcomes } = await useCase.execute({
      artifact: ARTIFACT,
      targets: [{ channel: RecapChannel.File }, { channel: RecapChannel.Discord, channelId: 'C1' }],
    });

    expect(outcomes[0]).toMatchObject({ channel: RecapChannel.File, status: 'published' });
    expect(outcomes[1]).toMatchObject({ channel: RecapChannel.Discord, status: 'failed' });
    if (outcomes[1].status === 'failed') {
      expect(outcomes[1].error).toMatch(/blew up/);
    }
  });

  it('reports "skipped" when no publisher is registered for a target channel', async () => {
    const gate: IContributorActionGate = {
      gate: vi.fn().mockResolvedValue({ approved: true, rationale: 'ok' }),
    };
    const useCase = new PublishMonthlyRecapUseCase(gate, []);

    const { outcomes } = await useCase.execute({
      artifact: ARTIFACT,
      targets: [{ channel: RecapChannel.File }],
    });

    expect(outcomes[0]).toMatchObject({ channel: RecapChannel.File, status: 'skipped' });
    expect(gate.gate).not.toHaveBeenCalled();
  });
});
