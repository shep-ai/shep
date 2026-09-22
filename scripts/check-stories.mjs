#!/usr/bin/env node
/* global process, console */
/**
 * Storybook story coverage gate.
 *
 * CLAUDE.md and AGENTS.md both declare a colocated `.stories.tsx` MANDATORY for
 * every web component, and `pnpm build:storybook` cannot detect a *missing*
 * story — only a broken one. So the rule went unenforced and 67 components
 * accumulated without stories.
 *
 * This is a RATCHET, not a big-bang cleanup: the components that were already
 * missing a story are grandfathered below, and the build fails only when a NEW
 * one appears. Deleting entries from the allowlist as stories get written is
 * the intended way to pay the debt down — the script also fails if an
 * allowlisted file has since gained a story or been deleted, so the list
 * cannot rot.
 *
 * Usage: node scripts/check-stories.mjs
 */

import { readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const COMPONENT_ROOT = 'src/presentation/web/components';

/** Components that predate this gate. Shrink this list; never grow it. */
const GRANDFATHERED = new Set([
  'src/presentation/web/components/assistant-ui/thread.tsx',
  'src/presentation/web/components/bedrock-memory-section.tsx',
  'src/presentation/web/components/common/add-repository-button/add-repository-button.tsx',
  'src/presentation/web/components/common/control-center-drawer/adopt-drawer-client.tsx',
  'src/presentation/web/components/common/control-center-drawer/create-drawer-client.tsx',
  'src/presentation/web/components/common/control-center-drawer/feature-drawer-client.tsx',
  'src/presentation/web/components/common/control-center-drawer/global-chat-drawer-client.tsx',
  'src/presentation/web/components/common/control-center-drawer/repository-drawer-client.tsx',
  'src/presentation/web/components/common/drawer-revision-input/drawer-revision-input.tsx',
  'src/presentation/web/components/common/editor-type-icons.tsx',
  'src/presentation/web/components/common/error-boundary.tsx',
  'src/presentation/web/components/features/application-page/app-overflow-menu.tsx',
  'src/presentation/web/components/features/application-page/cloud-provider-icons.tsx',
  'src/presentation/web/components/features/application-page/delete-application-menu-item.tsx',
  'src/presentation/web/components/features/application-page/ide-tab/editor-pane.tsx',
  'src/presentation/web/components/features/application-page/ide-tab/file-tree-panel.tsx',
  'src/presentation/web/components/features/application-page/ide-tab/image-viewer.tsx',
  'src/presentation/web/components/features/application-page/operation-logs-drawer.tsx',
  'src/presentation/web/components/features/application-page/operation-logs-icon-button.tsx',
  'src/presentation/web/components/features/application-page/provider-list.tsx',
  'src/presentation/web/components/features/application-page/smart-deploy-cluster.tsx',
  'src/presentation/web/components/features/application-page/smart-deploy-logs-drawer.tsx',
  'src/presentation/web/components/features/application-page/terminal-tab-inner.tsx',
  'src/presentation/web/components/features/aspm/aspm-inventory-tree/aspm-repo-actions.tsx',
  'src/presentation/web/components/features/aspm/aspm-inventory-tree/aspm-row-actions-manager.tsx',
  'src/presentation/web/components/features/aspm/aspm-inventory-tree/aspm-row-actions.tsx',
  'src/presentation/web/components/features/chat/ChatMessageList.tsx',
  'src/presentation/web/components/features/chat/tool-bubble/file-card.tsx',
  'src/presentation/web/components/features/chat/tool-bubble/generic-bubble.tsx',
  'src/presentation/web/components/features/chat/tool-bubble/index.tsx',
  'src/presentation/web/components/features/chat/tool-bubble/tool-chip.tsx',
  'src/presentation/web/components/features/chat/turn-group-card.tsx',
  'src/presentation/web/components/features/chat/turn-group-list.tsx',
  'src/presentation/web/components/features/clusters/clusters-page-client.tsx',
  'src/presentation/web/components/features/control-center/collaboration-onboarding.tsx',
  'src/presentation/web/components/features/control-center/control-center-inner.tsx',
  'src/presentation/web/components/features/control-center/new-project-dialog.tsx',
  'src/presentation/web/components/features/control-center/use-fab-actions.tsx',
  'src/presentation/web/components/features/feature-tree-table/application-row-actions-manager.tsx',
  'src/presentation/web/components/features/feature-tree-table/feature-row-actions-manager.tsx',
  'src/presentation/web/components/features/feature-tree-table/repository-group-actions.tsx',
  'src/presentation/web/components/features/features-canvas/canvas-toolbar.tsx',
  'src/presentation/web/components/features/features-canvas/manage-workspace-dialog.tsx',
  'src/presentation/web/components/features/features-canvas/workspace-name-dialog.tsx',
  'src/presentation/web/components/features/features-canvas/workspace-selector.tsx',
  'src/presentation/web/components/features/session-tree/session-tree-actions.tsx',
  'src/presentation/web/components/features/settings/github-integration-section.tsx',
  'src/presentation/web/components/features/version/version-page-client.tsx',
  'src/presentation/web/components/layouts/app-shell/app-shell.tsx',
  'src/presentation/web/components/layouts/app-shell/apps-only-shell.tsx',
  'src/presentation/web/components/pm/analytics/analytics-dashboard.tsx',
  'src/presentation/web/components/pm/board-view/board-card.tsx',
  'src/presentation/web/components/pm/board-view/board-column.tsx',
  'src/presentation/web/components/pm/calendar-view/calendar-day-cell.tsx',
  'src/presentation/web/components/pm/page-editor/page-editor-toolbar.tsx',
  'src/presentation/web/components/pm/table-view/table-cell-editor.tsx',
  'src/presentation/web/components/pm/timeline-view/gantt-bar.tsx',
  'src/presentation/web/components/pm/timeline-view/timeline-view-wrapper.tsx',
  'src/presentation/web/components/providers/i18n-provider.tsx',
  'src/presentation/web/components/providers/query-provider.tsx',
  'src/presentation/web/components/ui/command.tsx',
  'src/presentation/web/components/ui/dropdown-menu.tsx',
  'src/presentation/web/components/ui/separator.tsx',
]);

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Story paths that satisfy the rule for a given component file. */
function storyCandidates(file) {
  const dir = dirname(file);
  const base = basename(file, '.tsx');
  // A `dir/index.tsx` component is conventionally documented by
  // `dir/<dirname>.stories.tsx`.
  return base === 'index'
    ? [join(dir, `${basename(dir)}.stories.tsx`), join(dir, 'index.stories.tsx')]
    : [join(dir, `${base}.stories.tsx`)];
}

function collectComponents(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectComponents(path, found);
      continue;
    }
    if (!path.endsWith('.tsx')) continue;
    if (path.endsWith('.stories.tsx') || path.endsWith('.test.tsx')) continue;
    found.push(path);
  }
  return found;
}

const components = collectComponents(COMPONENT_ROOT);
const missing = components.filter((file) => !storyCandidates(file).some(exists));

const newViolations = missing.filter((file) => !GRANDFATHERED.has(file));
const staleAllowlist = [...GRANDFATHERED].filter((file) => !missing.includes(file));

if (newViolations.length > 0) {
  console.error(`\n${newViolations.length} component(s) have no colocated .stories.tsx:\n`);
  for (const file of newViolations) console.error(`  ${file}`);
  console.error('\nEvery web component MUST have a colocated .stories.tsx (see CLAUDE.md).\n');
}

if (staleAllowlist.length > 0) {
  console.error(
    `\n${staleAllowlist.length} entr(ies) in the grandfathered list no longer need to be there.`
  );
  console.error('Remove them from scripts/check-stories.mjs:\n');
  for (const file of staleAllowlist) console.error(`  ${file}`);
  console.error('');
}

if (newViolations.length > 0 || staleAllowlist.length > 0) process.exit(1);

console.log(
  `Story coverage OK — ${components.length - missing.length}/${components.length} components have stories ` +
    `(${missing.length} grandfathered).`
);
