/**
 * ComplianceCoverageView component tests (feature 098, phase 9 / task-54).
 *
 * Covers all variants: Default, Loading, Error, Empty, single-framework,
 * and a framework with zero open findings (all controls "without
 * evidence").
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  ComplianceCoverageView,
  type FrameworkCoverageView,
} from '@/components/features/aspm/compliance-coverage-view';
import { ComplianceFramework } from '@shepai/core/domain/generated/output';

const asvs: FrameworkCoverageView = {
  frameworkId: ComplianceFramework.OwaspAsvs,
  totalControls: 2,
  controlsWithOpenFindings: 1,
  controlsWithoutEvidence: 1,
  totalOpenFindingLinks: 4,
  controls: [
    {
      controlId: 'cc-asvs-v5-3-4',
      controlIdentifier: 'V5.3.4',
      title: 'Parameterized queries used for data access',
      openFindingCount: 4,
    },
    {
      controlId: 'cc-asvs-v2-1-1',
      controlIdentifier: 'V2.1.1',
      title: 'Passwords are at least 12 characters',
      openFindingCount: 0,
    },
  ],
};

const cwe: FrameworkCoverageView = {
  frameworkId: ComplianceFramework.CweTop25,
  totalControls: 1,
  controlsWithOpenFindings: 0,
  controlsWithoutEvidence: 1,
  totalOpenFindingLinks: 0,
  controls: [
    {
      controlId: 'cc-cwe-79',
      controlIdentifier: 'CWE-79',
      title: 'Cross-site Scripting',
      openFindingCount: 0,
    },
  ],
};

describe('ComplianceCoverageView', () => {
  it('renders the Loading state', () => {
    render(<ComplianceCoverageView loading />);
    expect(screen.getByTestId('compliance-coverage-loading')).toBeInTheDocument();
  });

  it('renders the Error state', () => {
    render(<ComplianceCoverageView error="boom" />);
    expect(screen.getByTestId('compliance-coverage-error')).toHaveTextContent('boom');
  });

  it('renders the Empty state when no frameworks are supplied', () => {
    render(<ComplianceCoverageView frameworks={[]} />);
    expect(screen.getByTestId('compliance-coverage-empty')).toBeInTheDocument();
  });

  it('renders one section per framework with its labeled heading', () => {
    render(<ComplianceCoverageView frameworks={[asvs, cwe]} />);
    expect(screen.getByText('OWASP ASVS')).toBeInTheDocument();
    expect(screen.getByText('CWE Top 25')).toBeInTheDocument();
    expect(
      screen.getByTestId(`compliance-section-${ComplianceFramework.OwaspAsvs}`)
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`compliance-section-${ComplianceFramework.CweTop25}`)
    ).toBeInTheDocument();
  });

  it('renders the four summary tiles per framework', () => {
    render(<ComplianceCoverageView frameworks={[asvs]} />);
    expect(
      screen.getByTestId(`compliance-tile-${ComplianceFramework.OwaspAsvs}-total`)
    ).toHaveTextContent('2');
    expect(
      screen.getByTestId(`compliance-tile-${ComplianceFramework.OwaspAsvs}-with-open`)
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId(`compliance-tile-${ComplianceFramework.OwaspAsvs}-without-evidence`)
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId(`compliance-tile-${ComplianceFramework.OwaspAsvs}-open-links`)
    ).toHaveTextContent('4');
  });

  it('renders a row per control with identifier, title, and open count', () => {
    render(<ComplianceCoverageView frameworks={[asvs]} />);
    const row = screen.getByTestId(`compliance-row-${ComplianceFramework.OwaspAsvs}-V5.3.4`);
    expect(row).toHaveTextContent('V5.3.4');
    expect(row).toHaveTextContent('Parameterized queries used for data access');
    expect(row).toHaveTextContent('4');
  });

  it('shows an empty-table fallback when the framework has no controls', () => {
    render(
      <ComplianceCoverageView
        frameworks={[
          {
            frameworkId: ComplianceFramework.OwaspAsvs,
            totalControls: 0,
            controlsWithOpenFindings: 0,
            controlsWithoutEvidence: 0,
            totalOpenFindingLinks: 0,
            controls: [],
          },
        ]}
      />
    );
    expect(
      screen.getByTestId(`compliance-table-${ComplianceFramework.OwaspAsvs}-empty`)
    ).toBeInTheDocument();
  });

  it('renders a framework whose controls have zero open findings', () => {
    render(<ComplianceCoverageView frameworks={[cwe]} />);
    const row = screen.getByTestId(`compliance-row-${ComplianceFramework.CweTop25}-CWE-79`);
    expect(row).toHaveTextContent('CWE-79');
    expect(row).toHaveTextContent('0');
  });
});
