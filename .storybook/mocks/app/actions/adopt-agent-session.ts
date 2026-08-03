export async function adoptAgentSession(input: {
  sessionId: string;
  agentType: string;
  repositoryPath: string;
}): Promise<{
  featureId?: string;
  featureName?: string;
  derivedLocally?: boolean;
  error?: string;
}> {
  return {
    featureId: `feat-${input.sessionId}`,
    featureName: 'Adopted session feature',
    derivedLocally: false,
  };
}

export async function resumeAgentSession(input: {
  sessionId: string;
  agentType: string;
  cwd: string;
}): Promise<{ terminalId?: string; command?: string; error?: string }> {
  return { terminalId: 'term-storybook', command: `claude --resume ${input.sessionId}` };
}

export async function describeResumeCommand(input: {
  sessionId: string;
  agentType: string;
  cwd: string;
}): Promise<{ command?: string; error?: string }> {
  const binary = input.agentType === 'cursor' ? 'cursor-agent' : 'claude';
  return { command: `${binary} --resume ${input.sessionId}` };
}
