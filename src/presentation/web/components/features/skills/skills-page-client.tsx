'use client';

import { useState, useMemo } from 'react';
import { Search, Puzzle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { SkillList } from './skill-list';
import { CategoryFilter } from './category-filter';
import { SkillDetailDrawer } from './skill-detail-drawer';
import type { SkillInjectionConfig } from '@shepai/core/domain/generated/output';
import { Separator } from '@/components/ui/separator';
import { AutoInjectedSkillsSection } from './auto-injected-skills-section';
import type { SkillCategory, SkillData } from '@/lib/skills';

export interface SkillsPageClientProps {
  skills: SkillData[];
  injectionConfig: SkillInjectionConfig;
}

function computeCategoryCounts(skills: SkillData[]): Record<SkillCategory, number> {
  const counts: Record<SkillCategory, number> = {
    Workflow: 0,
    'Code Generation': 0,
    Analysis: 0,
    Reference: 0,
  };
  for (const skill of skills) {
    counts[skill.category]++;
  }
  return counts;
}

export function SkillsPageClient({ skills, injectionConfig }: SkillsPageClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SkillCategory | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillData | null>(null);
  const [groupByPackage, setGroupByPackage] = useState(true);

  const categoryCounts = useMemo(() => computeCategoryCounts(skills), [skills]);

  const filteredSkills = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return skills.filter((skill) => {
      if (activeCategory && skill.category !== activeCategory) return false;
      if (query) {
        const matchesName = skill.name.toLowerCase().includes(query);
        const matchesDescription = skill.description.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription) return false;
      }
      return true;
    });
  }, [skills, searchQuery, activeCategory]);

  const clearFilters = () => {
    setSearchQuery('');
    setActiveCategory(null);
  };

  // No skills installed at all
  if (skills.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="Skills" description="Claude Code skills available to this project" />
        <AutoInjectedSkillsSection config={injectionConfig} discoveredSkills={skills} />
        <Separator />
        <EmptyState
          icon={<Puzzle className="size-10" />}
          title="No skills found"
          description="No Claude Code skills are installed. Add skills to .claude/skills/ to get started."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Skills" description="Claude Code skills available to this project" />

      {/* Feature Skills */}
      <AutoInjectedSkillsSection config={injectionConfig} discoveredSkills={skills} />
      <Separator />

      {/* Search */}
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ps-9"
        />
      </div>

      {/* Category Filter + Grouping Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <CategoryFilter
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          counts={categoryCounts}
        />
        <div className="flex items-center gap-2">
          <Switch
            id="group-by-package"
            checked={groupByPackage}
            onCheckedChange={setGroupByPackage}
          />
          <Label htmlFor="group-by-package" className="cursor-pointer text-sm font-normal">
            Group by package
          </Label>
        </div>
      </div>

      {/* Skill List or Empty Filter State */}
      {filteredSkills.length > 0 ? (
        <SkillList
          skills={filteredSkills}
          onSkillSelect={setSelectedSkill}
          groupByPackage={groupByPackage}
        />
      ) : (
        <EmptyState
          icon={<Search className="size-10" />}
          title="No matching skills"
          description="No skills match your current search and filter criteria."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      )}

      {/* Skill Detail Drawer */}
      <SkillDetailDrawer skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
    </div>
  );
}
