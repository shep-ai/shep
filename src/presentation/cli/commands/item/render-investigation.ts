/** Terminal rendering of a work item investigation (spec 123). */

import {
  InvestigationStatus,
  type Hypothesis,
  type WorkItem,
  type WorkItemInvestigation,
} from '@/domain/generated/output.js';
import { workItemKey } from '@/domain/shared/work-item-key.js';
import { colors } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

const SHORT_SHA_LENGTH = 7;
const INDENT = '   ';

function renderHypothesis(hypothesis: Hypothesis): string[] {
  const t = getCliI18n().t;
  const evidence = hypothesis.evidence.map(
    (e) =>
      `${INDENT}  ${colors.accent(`${e.file}${e.line === undefined ? '' : `:${e.line}`}`)}  ${e.note}`
  );
  return [
    `${colors.brand(`${hypothesis.number}. ${hypothesis.title}`)}  ${colors.muted(`[${hypothesis.confidence}]`)}`,
    `${INDENT}${hypothesis.rootCause}`,
    ...(evidence.length > 0
      ? [`${INDENT}${colors.muted(`${t('cli:commands.item.render.evidence')}:`)}`, ...evidence]
      : []),
    `${INDENT}${colors.muted(`${t('cli:commands.item.render.test')}:`)} ${hypothesis.testPlan}`,
    `${INDENT}${colors.muted(`${t('cli:commands.item.render.fix')}:`)} ${hypothesis.fixPlan}`,
  ];
}

/** Lines describing a work item's latest investigation, or how to start one. */
export function renderInvestigation(
  workItem: WorkItem,
  investigation: WorkItemInvestigation | undefined
): string[] {
  const t = getCliI18n().t;
  const key = workItemKey(workItem);
  const title = `${colors.brand(key)} ${workItem.title}`;
  if (!investigation) return [title, t('cli:commands.item.render.none', { key })];

  const commit = investigation.commitSha
    ? ` @ ${investigation.commitSha.slice(0, SHORT_SHA_LENGTH)}`
    : '';
  const lines = [
    title,
    colors.muted(
      t('cli:commands.item.render.header', {
        repository: investigation.repositoryPath,
        commit,
        agent: investigation.agentType ?? '—',
        status: investigation.status,
      })
    ),
  ];
  if (investigation.summary) lines.push('', investigation.summary);
  if (investigation.error) lines.push('', colors.error(investigation.error));

  const open =
    investigation.status === InvestigationStatus.Pending ||
    investigation.status === InvestigationStatus.Running;
  if (open) return [...lines, '', t('cli:commands.item.render.running', { key })];

  for (const hypothesis of investigation.hypotheses)
    lines.push('', ...renderHypothesis(hypothesis));
  if (investigation.status !== InvestigationStatus.Completed) return lines;
  lines.push(
    '',
    investigation.featureId
      ? t('cli:commands.item.render.approved', {
          number: investigation.approvedHypothesisNumber,
          feature: investigation.featureId,
        })
      : t('cli:commands.item.render.next', { key })
  );
  return lines;
}
