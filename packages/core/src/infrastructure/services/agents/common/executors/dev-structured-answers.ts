/**
 * Fixture answers from the dev agent for the factory's structured prompts —
 * bug investigation (spec 123), discovery (spec 128) and incident triage
 * (spec 129) — so those loops run end to end locally with agent type "dev".
 * Each answer is built from what the prompt itself lists, so cited ids are
 * real and pass the use cases' own checks.
 */

const DISCOVERY_MARKER = 'You are the product discovery agent';
const TRIAGE_MARKER = 'You are triaging a production incident';
const INVESTIGATION_MARKER = 'You are investigating a bug report';
const SIGNAL_LINE = /^- \[([^\]]+)\] (.+?) \(/;
const THEME_LINE = /^- (.+): (.+)$/;
const MAX_PROPOSALS = 2;

function sectionLines(prompt: string, heading: string): string[] {
  const start = prompt.indexOf(`## ${heading}`);
  if (start === -1) return [];
  const rest = prompt.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).filter((line) => line.startsWith('- '));
}

function field(prompt: string, label: string): string {
  const line = prompt.split('\n').find((candidate) => candidate.startsWith(`${label}: `));
  return line ? line.slice(label.length + 2).trim() : '';
}

function discovery(prompt: string): string {
  const signals = sectionLines(prompt, 'Signals not linked to any opportunity')
    .map((line) => SIGNAL_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ id: match[1], title: match[2] }));
  const themes = sectionLines(prompt, 'Themes among them')
    .map((line) => THEME_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ label: match[1], ids: match[2].split(',').map((id) => id.trim()) }));
  const groups =
    themes.length > 0
      ? themes.map((theme) => ({ name: theme.label, ids: theme.ids }))
      : signals.slice(0, 1).map((signal) => ({ name: signal.title, ids: [signal.id] }));
  const proposals = groups.slice(0, MAX_PROPOSALS).map((group) => ({
    title: `Resolve ${group.name}`,
    problem: `Customers keep reporting ${group.name}.`,
    outline: `Find where ${group.name} comes from, fix it, and cover it with a regression test.`,
    rationale: `Loose signals pointing at the same problem: ${group.ids.length}.`,
    signalIds: group.ids,
    reviewHours: 4,
    confidence: 0.7,
  }));
  return JSON.stringify({ proposals });
}

function triage(prompt: string): string {
  const incident = field(prompt, 'Incident') || 'The incident';
  const workload = field(prompt, 'Workload (Kubernetes deployment)');
  const named = workload !== '' && workload !== 'not named';
  return JSON.stringify({
    summary: `${incident}: errors began right after the latest rollout of ${named ? workload : 'the service'}.`,
    hypotheses: [
      {
        cause: 'The latest release introduced a regression',
        confidence: 'High',
        evidence: 'Errors start with the newest replica set; earlier pods were healthy.',
      },
      {
        cause: 'Pods are short of memory under load',
        confidence: 'Medium',
        evidence: 'Restarts cluster around traffic peaks.',
      },
      {
        cause: 'A downstream dependency is slow',
        confidence: 'Low',
        evidence: 'Some timeouts mention an upstream call.',
      },
    ],
    action: named
      ? {
          kind: 'Rollback',
          reason: 'Errors began with the latest rollout; roll back to the last healthy revision.',
        }
      : { kind: 'None', reason: 'No workload is named, so no runtime action applies.' },
  });
}

function investigation(prompt: string): string {
  const key = field(prompt, 'Key') || 'The report';
  const title = field(prompt, 'Title') || 'the reported bug';
  return JSON.stringify({
    summary: `${key} reports "${title}". The behaviour lives in the request handling path, where an edge case is not handled.`,
    hypotheses: [
      {
        title: 'Unhandled edge case in the request handler',
        rootCause: 'The handler assumes a value that is missing for this case and fails.',
        confidence: 'High',
        evidence: [{ file: 'README.md', line: 1, note: 'Entry point described here.' }],
        testPlan: 'Add a unit test that sends the failing case and expects success.',
        fixPlan: 'Guard the missing value and fall back to the default path.',
      },
      {
        title: 'Stale cached state',
        rootCause: 'A cached value from an earlier request is reused.',
        confidence: 'Medium',
        evidence: [{ file: 'README.md', note: 'Caching mentioned in the overview.' }],
        testPlan: 'Add a test that runs two requests in a row.',
        fixPlan: 'Key the cache by the request owner.',
      },
    ],
  });
}

/** The fixture answer for a structured factory prompt, or undefined for any other prompt. */
export function devStructuredAnswer(prompt: string): string | undefined {
  if (prompt.includes(DISCOVERY_MARKER)) return discovery(prompt);
  if (prompt.includes(TRIAGE_MARKER)) return triage(prompt);
  if (prompt.includes(INVESTIGATION_MARKER)) return investigation(prompt);
  return undefined;
}
