export interface ApplicationDebugPromptResult {
  systemPrompt?: string;
  userMessage?: string;
  combined?: string;
  error?: string;
}

export async function getApplicationDebugPrompt(
  _applicationId: string
): Promise<ApplicationDebugPromptResult> {
  return { error: 'Not available in Storybook' };
}
