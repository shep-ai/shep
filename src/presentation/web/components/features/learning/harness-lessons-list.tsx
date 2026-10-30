'use client';

import { useTranslation } from 'react-i18next';
import type { HarnessLesson } from '@shepai/core/domain/generated/output';

export interface HarnessLessonsListProps {
  lessons: readonly HarnessLesson[];
}

/** Transferable lessons about harness edits that later refinements read. */
export function HarnessLessonsList({ lessons }: HarnessLessonsListProps) {
  const { t } = useTranslation('web');
  if (lessons.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-4 text-xs" data-testid="learning-no-lessons">
        {t('learning.noLessons')}
      </p>
    );
  }
  return (
    <ul className="space-y-2 px-4 py-3" data-testid="harness-lessons">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="rounded-md border px-3 py-2 text-xs">
          <p className="text-muted-foreground">{t('learning.lesson.when', { cue: lesson.cue })}</p>
          <p className="font-medium">{lesson.lesson}</p>
          <p className="text-muted-foreground mt-1">{lesson.evidence}</p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {t(`learning.confidence.${lesson.confidence}`)}
          </p>
        </li>
      ))}
    </ul>
  );
}
