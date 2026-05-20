import type { Meta, StoryObj } from '@storybook/react';
import { DoctorSummary, type DoctorSummaryReport } from './DoctorSummary';
import { DiagnosticStatus } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof DoctorSummary> = {
  title: 'Contributors/DoctorSummary',
  component: DoctorSummary,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DoctorSummary>;

const allOk: DoctorSummaryReport = {
  overallStatus: DiagnosticStatus.Ok,
  summary: { ok: 4, warn: 0, fail: 0 },
  results: [
    { name: 'node-version', status: DiagnosticStatus.Ok, detail: 'v22.10.0' },
    { name: 'pnpm-installed', status: DiagnosticStatus.Ok, detail: '9.12.0' },
    { name: 'git-installed', status: DiagnosticStatus.Ok, detail: '2.46.0' },
    { name: 'gh-cli-auth', status: DiagnosticStatus.Ok, detail: 'authenticated as octocat' },
  ],
};

const mixedWarn: DoctorSummaryReport = {
  overallStatus: DiagnosticStatus.Warn,
  summary: { ok: 3, warn: 2, fail: 0 },
  results: [
    { name: 'node-version', status: DiagnosticStatus.Ok, detail: 'v22.10.0' },
    { name: 'pnpm-installed', status: DiagnosticStatus.Ok, detail: '9.12.0' },
    {
      name: 'gh-cli-auth',
      status: DiagnosticStatus.Warn,
      detail: 'gh CLI installed but not authenticated',
      fixHint: 'Run `gh auth login`',
    },
    { name: 'git-installed', status: DiagnosticStatus.Ok, detail: '2.46.0' },
    {
      name: 'agent-cli-availability',
      status: DiagnosticStatus.Warn,
      detail: 'No agent CLIs detected (Claude/Cursor/Gemini)',
      fixHint: 'Install the Claude CLI to run shep agents locally',
    },
  ],
};

const hasFail: DoctorSummaryReport = {
  overallStatus: DiagnosticStatus.Fail,
  summary: { ok: 2, warn: 1, fail: 2 },
  results: [
    {
      name: 'node-version',
      status: DiagnosticStatus.Fail,
      detail: 'Node 18.20.0 detected; need >= 22',
      fixHint: 'Run `nvm install 22`',
    },
    { name: 'pnpm-installed', status: DiagnosticStatus.Ok, detail: '9.12.0' },
    {
      name: 'dotenv-presence',
      status: DiagnosticStatus.Fail,
      detail: '.env file missing at workspace root',
      fixHint: 'Copy .env.example to .env',
    },
    {
      name: 'gh-cli-auth',
      status: DiagnosticStatus.Warn,
      detail: 'gh CLI installed but not authenticated',
    },
    { name: 'git-installed', status: DiagnosticStatus.Ok, detail: '2.46.0' },
  ],
};

const errorState: DoctorSummaryReport = {
  overallStatus: DiagnosticStatus.Fail,
  summary: { ok: 0, warn: 0, fail: 1 },
  results: [
    {
      name: 'doctor-runner',
      status: DiagnosticStatus.Fail,
      detail: 'Unable to run diagnostics for this workspace',
      fixHint: 'Retry after confirming the repository path is accessible',
    },
  ],
};

export const Loading: Story = {
  args: { loading: true },
};

export const AllOk: Story = {
  args: { report: allOk },
};

export const WithWarnings: Story = {
  args: { report: mixedWarn },
};

export const WithFailures: Story = {
  args: { report: hasFail },
};

export const ErrorState: Story = {
  args: { report: errorState },
};
