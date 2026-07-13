import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillList } from '@/components/features/skills/skill-list';
import type { SkillData } from '@/lib/skills';

function makeSkill(overrides: Partial<SkillData> = {}): SkillData {
  return {
    name: 'test-skill',
    displayName: 'test-skill',
    description: 'A test skill',
    category: 'Reference',
    source: 'project',
    body: '',
    resources: [],
    ...overrides,
  };
}

describe('SkillList', () => {
  it('groups skills under package headings derived from the name prefix', () => {
    const skills = [
      makeSkill({ name: 'shep-kit:plan', displayName: 'plan' }),
      makeSkill({ name: 'shep-kit:implement', displayName: 'implement' }),
      makeSkill({ name: 'shep:ui-component', displayName: 'ui-component' }),
    ];
    render(<SkillList skills={skills} onSkillSelect={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'shep-kit (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'shep (1)' })).toBeInTheDocument();
  });

  it('derives the package from a trailing (pkg) tag in the description', () => {
    const skills = [
      makeSkill({
        name: 'browse',
        displayName: 'browse',
        description: 'Headless browser. (gstack)',
      }),
      makeSkill({ name: 'qa', displayName: 'qa', description: 'QA a web app. (gstack)' }),
    ];
    render(<SkillList skills={skills} onSkillSelect={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'gstack (2)' })).toBeInTheDocument();
  });

  it('places standalone skills under an "Ungrouped" heading, ordered last', () => {
    const skills = [
      makeSkill({ name: 'shadcn-ui', displayName: 'shadcn-ui', description: 'UI patterns' }),
      makeSkill({ name: 'shep-kit:plan', displayName: 'plan' }),
    ];
    render(<SkillList skills={skills} onSkillSelect={vi.fn()} />);

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings[0]).toHaveTextContent('shep-kit');
    expect(headings[headings.length - 1]).toHaveTextContent('Ungrouped');
  });

  it('renders a flat grid with no headings when groupByPackage is false', () => {
    const skills = [
      makeSkill({ name: 'shep-kit:plan', displayName: 'plan' }),
      makeSkill({ name: 'shep:ui-component', displayName: 'ui-component' }),
    ];
    render(<SkillList skills={skills} groupByPackage={false} onSkillSelect={vi.fn()} />);

    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByTestId('skill-card-shep-kit:plan')).toBeInTheDocument();
    expect(screen.getByTestId('skill-card-shep:ui-component')).toBeInTheDocument();
  });

  it('renders the correct SkillCard components', () => {
    const skills = [
      makeSkill({ name: 'shep-kit:plan', displayName: 'plan' }),
      makeSkill({ name: 'shep-kit:implement', displayName: 'implement' }),
      makeSkill({ name: 'shadcn-ui', displayName: 'shadcn-ui', description: 'UI patterns' }),
    ];
    render(<SkillList skills={skills} onSkillSelect={vi.fn()} />);

    expect(screen.getByTestId('skill-card-shep-kit:plan')).toBeInTheDocument();
    expect(screen.getByTestId('skill-card-shep-kit:implement')).toBeInTheDocument();
    expect(screen.getByTestId('skill-card-shadcn-ui')).toBeInTheDocument();
  });

  it('passes onSkillSelect to cards', async () => {
    const user = userEvent.setup();
    const onSkillSelect = vi.fn();
    const skill = makeSkill({ name: 'my-skill', displayName: 'my-skill' });
    render(<SkillList skills={[skill]} onSkillSelect={onSkillSelect} />);

    await user.click(screen.getByTestId('skill-card-my-skill'));
    expect(onSkillSelect).toHaveBeenCalledOnce();
    expect(onSkillSelect).toHaveBeenCalledWith(skill);
  });

  it('renders nothing when the skills array is empty', () => {
    const { container } = render(<SkillList skills={[]} onSkillSelect={vi.fn()} />);
    expect(container.querySelectorAll('section')).toHaveLength(0);
  });
});
