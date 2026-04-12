'use server';

import { resolve } from '@/lib/server-container';
import type { CreateProjectUseCase } from '@shepai/core/application/use-cases/projects/create-project.use-case';
import type { AddRepositoryUseCase } from '@shepai/core/application/use-cases/repositories/add-repository.use-case';
import type { Feature, Repository } from '@shepai/core/domain/generated/output';
import { createFeature } from './create-feature';

interface QuickFeatureInput {
  description: string;
  attachments?: { path: string; name: string; notes?: string }[];
  agentType?: string;
  model?: string;
  fast?: boolean;
}

/**
 * Default project instructions prepended to the user's description.
 * These ensure that even a vague one-liner from a non-technical user
 * results in a well-structured, runnable React application.
 */
const PROJECT_PREAMBLE = `\
## Project Requirements

Build this as a **React application** using Vite as the build tool.

### Structure
- Initialize with \`npm create vite@latest . -- --template react-ts\` scaffolding
- Organize code into clear folders: \`src/components/\`, \`src/pages/\`, \`src/assets/\`
- Use TypeScript throughout
- Include a working \`package.json\` with all dependencies

### Design & UI
- Create a polished, production-quality interface — not a prototype
- Use modern CSS (CSS modules or Tailwind CSS) with thoughtful spacing, typography, and color
- Make it fully responsive (mobile-first)
- Add subtle micro-interactions: hover states, transitions, focus rings
- Use professional placeholder content (realistic text, not lorem ipsum)
- Pick a cohesive color palette and apply it consistently

### Quality
- Every component should be self-contained and reusable
- Include proper HTML semantics and accessibility (ARIA labels, alt text, keyboard nav)
- The app must start successfully with \`npm install && npm run dev\`

---

## What to Build
`;

/**
 * Derive a concise project name from a free-form description.
 * Takes the first handful of meaningful words — `CreateProjectUseCase`
 * will then slugify + cap length for the actual directory name.
 */
function deriveProjectName(description: string): string {
  return description.trim().split(/\s+/).slice(0, 6).join(' ');
}

export async function createProjectAndFeature(input: QuickFeatureInput): Promise<{
  feature?: Feature;
  repository?: Repository;
  repositoryPath?: string;
  error?: string;
}> {
  const { description, attachments, agentType, model } = input;

  if (!description?.trim()) {
    return { error: 'Description is required' };
  }

  try {
    const createProject = resolve<CreateProjectUseCase>('CreateProjectUseCase');
    const projectResult = await createProject.execute({
      name: deriveProjectName(description),
    });
    if (!projectResult.ok) {
      return { error: projectResult.error };
    }
    const projectPath = projectResult.path;

    const addRepo = resolve<AddRepositoryUseCase>('AddRepositoryUseCase');
    const repository = await addRepo.execute({ path: projectPath });

    // Enrich the user's prompt with project-quality instructions
    const enrichedDescription = PROJECT_PREAMBLE + description.trim();

    const featureResult = await createFeature({
      description: enrichedDescription,
      repositoryPath: projectPath,
      attachments,
      agentType,
      model,
      fast: input.fast,
    });

    if (featureResult.error) {
      return { error: featureResult.error };
    }

    return {
      feature: featureResult.feature,
      repository,
      repositoryPath: projectPath,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return { error: message };
  }
}
