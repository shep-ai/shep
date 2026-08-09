/**
 * Storybook stand-in for the run-plan override action. Branches on the target
 * id so one module-wide mock can serve every story — see
 * `get-dev-server-run-plan.ts` for the sentinel ids.
 */

export async function overrideDevServerRunPlan(input: {
  targetType: string;
  targetId: string;
  command?: string;
}): Promise<unknown> {
  if (input.targetId === 'story-repo-config') {
    return {
      status: 'repo-config-controlled',
      repoPath: '/repos/acme',
      message:
        'A committed .shep/dev.json controls this repository — it is re-read on every start and outranks any stored plan. Edit that file to change what runs.',
    };
  }

  if (!input.command?.trim()) {
    return {
      status: 'validation-failed',
      errors: [{ field: 'command', message: 'A dev server command is required.' }],
    };
  }

  return {
    status: 'ok',
    repoPath: '/repos/acme',
    plan: {
      repoPath: '/repos/acme',
      command: input.command,
      cwd: '/repos/acme',
      source: 'Manual',
      setupCommands: [],
      isStale: false,
    },
  };
}
