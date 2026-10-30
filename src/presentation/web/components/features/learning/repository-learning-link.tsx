'use client';

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { learningHref } from './learning-types';

export interface RepositoryLearningLinkProps {
  repositoryPath: string;
  className?: string;
}

/** Toolbar link from a repository to its Learning page; only with selfLearning on (spec 150). */
export function RepositoryLearningLink({ repositoryPath, className }: RepositoryLearningLinkProps) {
  const { t } = useTranslation('web');
  const { selfLearning } = useFeatureFlags();
  if (!selfLearning) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={learningHref(repositoryPath)}
          className={className}
          aria-label={t('navigation.learning')}
          data-testid="repository-learning-link"
        >
          <GraduationCap className="size-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {t('navigation.learning')}
      </TooltipContent>
    </Tooltip>
  );
}
