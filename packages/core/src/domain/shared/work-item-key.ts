/**
 * The human key of a work item, such as PAY-42: its project prefix and its
 * sequence number within the project.
 */

export function workItemKey(item: { identifierPrefix: string; sequenceId: number }): string {
  return `${item.identifierPrefix}-${item.sequenceId}`;
}
