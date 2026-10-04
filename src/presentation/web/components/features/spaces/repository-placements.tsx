'use client';

/**
 * RepositoryPlacements — every known repository with the space and product
 * line it lands in and why (pinned, a rule, or the default). A repository can
 * be pinned to another space, or unpinned so the rules apply again.
 */

import { useTranslation } from 'react-i18next';
import { PinOff } from 'lucide-react';
import type {
  RepositoryPlacement,
  SpaceOverview,
} from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import { SpaceResolutionSource } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { assignRepository, unassignRepository } from '@/app/actions/manage-spaces';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunSpaceAction } from './spaces-types';

export interface RepositoryPlacementsProps {
  repositories: RepositoryPlacement[];
  spaces: SpaceOverview[];
  run: RunSpaceAction;
}

function Reason({
  placement,
  spaces,
}: {
  placement: RepositoryPlacement;
  spaces: SpaceOverview[];
}) {
  const { t } = useTranslation('web');
  if (placement.source === SpaceResolutionSource.Assignment) {
    return <Badge variant="secondary">{t('spaces.repositories.sourceAssignment')}</Badge>;
  }
  if (placement.source === SpaceResolutionSource.Rule) {
    const rule = spaces.flatMap((s) => s.rules).find((r) => r.id === placement.ruleId);
    return (
      <code className="text-[11px]">{rule?.pattern ?? t('spaces.repositories.sourceRule')}</code>
    );
  }
  return <span className="text-muted-foreground">{t('spaces.repositories.sourceDefault')}</span>;
}

export function RepositoryPlacements({ repositories, spaces, run }: RepositoryPlacementsProps) {
  const { t } = useTranslation('web');

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{t('spaces.repositories.title')}</h2>
      {repositories.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('spaces.repositories.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground bg-muted/40 text-start">
              <tr>
                <th className="px-3 py-2 text-start font-medium">
                  {t('spaces.repositories.repository')}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t('spaces.repositories.space')}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t('spaces.repositories.line')}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t('spaces.repositories.because')}
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {repositories.map((placement) => {
                const home = spaces.find((s) => s.space.id === placement.spaceId);
                const line = home?.productLines.find((l) => l.id === placement.productLineId);
                return (
                  <tr
                    key={placement.repositoryPath}
                    className="border-t"
                    data-testid={`repository-placement-${placement.repositoryPath}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{placement.name}</div>
                      <div className="text-muted-foreground font-mono text-[10px] break-all">
                        {placement.repositoryPath}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {home?.space.color ? (
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full"
                            style={{ backgroundColor: home.space.color }}
                          />
                        ) : null}
                        {home?.space.name}
                      </span>
                    </td>
                    <td className="px-3 py-2">{line?.name}</td>
                    <td className="px-3 py-2">
                      <Reason placement={placement} spaces={spaces} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <select
                          value=""
                          onChange={(e) =>
                            run(() =>
                              assignRepository({
                                repositoryPath: placement.repositoryPath,
                                space: e.target.value,
                              })
                            )
                          }
                          aria-label={t('spaces.repositories.pin')}
                          className={NATIVE_SELECT_CLASS}
                          data-testid="repository-pin"
                        >
                          <option value="" disabled>
                            {t('spaces.repositories.pin')}
                          </option>
                          {spaces.map(({ space }) => (
                            <option key={space.id} value={space.id}>
                              {space.name}
                            </option>
                          ))}
                        </select>
                        {placement.source === SpaceResolutionSource.Assignment ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t('spaces.repositories.unpin')}
                            title={t('spaces.repositories.unpin')}
                            onClick={() => run(() => unassignRepository(placement.repositoryPath))}
                            data-testid="repository-unpin"
                          >
                            <PinOff />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
