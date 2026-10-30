/** The fields every `shep learn` view of one learned-harness version starts with. */

import type { LearnedHarnessVersion } from '@/domain/generated/output.js';
import { colors, type DetailField } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { LEARN, isoDay, labels, shortId } from './learn-output.js';

export function versionFields(version: LearnedHarnessVersion): DetailField[] {
  const t = getCliI18n().t;
  const field = (key: string, value: string | undefined): DetailField => ({
    label: t(`${LEARN}.fields.${key}`),
    value,
  });
  return [
    field('version', colors.accent(version.id)),
    field('status', labels.status(version.status)),
    field('origin', labels.origin(version.origin)),
    field('scope', labels.scope(version.scope)),
    field('created', isoDay(version.createdAt)),
    field('components', String(version.components.length)),
    field('parent', version.parentVersionId && shortId(version.parentVersionId)),
    field('sourceFeature', version.sourceFeatureId && shortId(version.sourceFeatureId)),
    field('notes', version.notes),
    field('reason', version.statusReason),
  ];
}
