import { SkillCard } from './skill-card';
import { derivePackage, UNGROUPED_PACKAGE_LABEL } from '@/lib/skill-package';
import type { SkillData } from '@/lib/skills';

export interface SkillListProps {
  skills: SkillData[];
  onSkillSelect: (skill: SkillData) => void;
  /** Group skills under their package heading. Defaults to true. */
  groupByPackage?: boolean;
}

interface SkillGroup {
  label: string;
  skills: SkillData[];
}

function groupSkillsByPackage(skills: SkillData[]): SkillGroup[] {
  const groups = new Map<string, SkillData[]>();
  for (const skill of skills) {
    const label = derivePackage(skill.name, skill.description) ?? UNGROUPED_PACKAGE_LABEL;
    const group = groups.get(label) ?? [];
    group.push(skill);
    groups.set(label, group);
  }

  // Named packages first (alphabetical), the ungrouped bucket last.
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === UNGROUPED_PACKAGE_LABEL) return 1;
      if (b === UNGROUPED_PACKAGE_LABEL) return -1;
      return a.localeCompare(b);
    })
    .map(([label, groupSkills]) => ({ label, skills: groupSkills }));
}

function SkillGrid({
  skills,
  onSelect,
}: {
  skills: SkillData[];
  onSelect: SkillListProps['onSkillSelect'];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {skills.map((skill) => (
        <SkillCard key={skill.name} skill={skill} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function SkillList({ skills, onSkillSelect, groupByPackage = true }: SkillListProps) {
  if (skills.length === 0) return null;

  if (!groupByPackage) {
    return <SkillGrid skills={skills} onSelect={onSkillSelect} />;
  }

  return (
    <div className="space-y-8">
      {groupSkillsByPackage(skills).map((group) => (
        <section key={group.label}>
          <h2 className="mb-4 text-lg font-semibold">
            {group.label}{' '}
            <span className="text-muted-foreground text-sm font-normal">
              ({group.skills.length})
            </span>
          </h2>
          <SkillGrid skills={group.skills} onSelect={onSkillSelect} />
        </section>
      ))}
    </div>
  );
}
