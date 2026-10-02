/**
 * Contents of the files `shep harness init` proposes (spec 119, F2). Pure, so
 * the preview the user confirms is exactly what gets written.
 */
import {
  HARNESS_PROJECT_DIR,
  type HarnessProjectFile,
  type HarnessProjectInspection,
} from '../../ports/output/harness/index.js';

export const HARNESS_CONFIG_FILE = `${HARNESS_PROJECT_DIR}/config.yaml`;
export const HARNESS_POLICY_FILE = `${HARNESS_PROJECT_DIR}/policies/default.yaml`;
export const HARNESS_INSTRUCTIONS_README = `${HARNESS_PROJECT_DIR}/instructions/README.md`;

const quote = (value: string) => JSON.stringify(value);

export function buildHarnessConfigYaml(inspection: HarnessProjectInspection): string {
  const lines = [
    '# Shep Harness repository config — written by `shep harness init`.',
    'version: 1',
    inspection.testCommand
      ? `test_command: ${quote(inspection.testCommand)}`
      : '# test_command: "pnpm test"',
    inspection.lintCommand
      ? `lint_command: ${quote(inspection.lintCommand)}`
      : '# lint_command: "pnpm lint"',
  ];
  return `${lines.join('\n')}\n`;
}

export function buildHarnessPolicyYaml(inspection: HarnessProjectInspection): string {
  const header = [
    "# Repository permission rules for the Shep Harness, merged with shep's builtin defaults",
    '# (see `shep harness policies` or /harness → Tools & policies). Precedence: deny > ask > allow;',
    '# `hard: true` rules can never be approved.',
    'version: 1',
  ];
  if (inspection.sensitivePaths.length === 0) return `${header.join('\n')}\nrules: []\n`;
  const rules = [
    'rules:',
    '  - id: deny-repo-sensitive-files',
    '    effect: deny',
    '    hard: true',
    '    reason: Sensitive files detected in this repository by shep harness init',
    '    when:',
    '      path_matches:',
    ...inspection.sensitivePaths.map((p) => `        - ${quote(`**/${p}`)}`),
  ];
  return `${[...header, ...rules].join('\n')}\n`;
}

export function buildInstructionsReadme(inspection: HarnessProjectInspection): string {
  const known = inspection.instructionFiles.length
    ? inspection.instructionFiles.map((f) => `- ${f}`).join('\n')
    : '- (none found)';
  return `# Harness instructions

Markdown files in this folder are instructions the Shep Harness always follows
in this repository, alongside these files it already reads:

${known}

Optional frontmatter: \`id\`, \`title\`, \`priority\` (higher first) and \`enabled\`.
`;
}

export function buildHarnessProjectFiles(
  inspection: HarnessProjectInspection
): HarnessProjectFile[] {
  return [
    { path: HARNESS_CONFIG_FILE, content: buildHarnessConfigYaml(inspection) },
    { path: HARNESS_POLICY_FILE, content: buildHarnessPolicyYaml(inspection) },
    { path: HARNESS_INSTRUCTIONS_README, content: buildInstructionsReadme(inspection) },
  ];
}
