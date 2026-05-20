import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DoctorSummary, type DoctorSummaryReport } from '@/components/contributors/DoctorSummary';
import { DiagnosticStatus } from '@shepai/core/domain/generated/output';

const allOk: DoctorSummaryReport = {
  overallStatus: DiagnosticStatus.Ok,
  summary: { ok: 2, warn: 0, fail: 0 },
  results: [
    { name: 'node-version', status: DiagnosticStatus.Ok, detail: 'v22.10.0' },
    { name: 'pnpm-installed', status: DiagnosticStatus.Ok, detail: '9.12.0' },
  ],
};

const mixed: DoctorSummaryReport = {
  overallStatus: DiagnosticStatus.Warn,
  summary: { ok: 1, warn: 1, fail: 0 },
  results: [
    { name: 'node-version', status: DiagnosticStatus.Ok, detail: 'v22.10.0' },
    {
      name: 'gh-cli-auth',
      status: DiagnosticStatus.Warn,
      detail: 'gh CLI installed but not authenticated',
      fixHint: 'Run `gh auth login`',
    },
  ],
};

const hasFail: DoctorSummaryReport = {
  overallStatus: DiagnosticStatus.Fail,
  summary: { ok: 0, warn: 0, fail: 1 },
  results: [
    {
      name: 'node-version',
      status: DiagnosticStatus.Fail,
      detail: 'Node 18.20.0 detected; need >= 22',
    },
  ],
};

describe('DoctorSummary', () => {
  it('renders all-ok counts and rows', () => {
    render(<DoctorSummary report={allOk} />);
    expect(screen.getByTestId('doctor-summary-ok')).toHaveTextContent('2');
    expect(screen.getByTestId('doctor-summary-warn')).toHaveTextContent('0');
    expect(screen.getByTestId('doctor-summary-fail')).toHaveTextContent('0');
    expect(screen.getByTestId('doctor-row-node-version')).toBeInTheDocument();
    expect(screen.getByTestId('doctor-row-pnpm-installed')).toBeInTheDocument();
  });

  it('renders mixed report with warn counts and fix hint', () => {
    render(<DoctorSummary report={mixed} />);
    expect(screen.getByTestId('doctor-summary-warn')).toHaveTextContent('1');
    expect(screen.getByTestId('doctor-row-gh-cli-auth')).toBeInTheDocument();
    expect(screen.getByTestId('doctor-row-fix-gh-cli-auth')).toHaveTextContent('gh auth login');
  });

  it('renders has-fail report with fail count', () => {
    render(<DoctorSummary report={hasFail} />);
    expect(screen.getByTestId('doctor-summary-fail')).toHaveTextContent('1');
    expect(screen.getByTestId('doctor-row-node-version')).toHaveTextContent(
      'Node 18.20.0 detected; need >= 22'
    );
  });

  it('renders loading state when no report', () => {
    render(<DoctorSummary loading />);
    expect(screen.getByTestId('doctor-summary-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('doctor-summary-list')).not.toBeInTheDocument();
  });
});
