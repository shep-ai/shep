export async function getAllAgentModels() {
  return [
    {
      agentType: 'claude-code',
      label: 'Claude Code',
      models: [
        {
          id: 'claude-opus-4-6',
          displayName: 'Opus 4.6',
          description: 'Most capable, complex tasks',
        },
        { id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', description: 'Fast & balanced' },
        { id: 'claude-haiku-4-5', displayName: 'Haiku 4.5', description: 'Lightweight & quick' },
      ],
    },
    {
      agentType: 'cursor',
      label: 'Cursor CLI',
      models: [
        {
          id: 'claude-opus-4-6',
          displayName: 'Opus 4.6',
          description: 'Most capable, complex tasks',
        },
        { id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', description: 'Fast & balanced' },
        { id: 'gpt-5.4-high', displayName: 'GPT-5.4', description: 'Latest reasoning model' },
        { id: 'gpt-5.2', displayName: 'GPT-5.2', description: 'Flagship model' },
        { id: 'gpt-5.3-codex', displayName: 'GPT-5.3 Codex', description: 'Code specialist' },
        { id: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro', description: 'Advanced reasoning' },
        { id: 'composer-1.5', displayName: 'Composer 1.5', description: 'Multi-file editing' },
        { id: 'grok-code', displayName: 'Grok Code', description: 'xAI code model' },
      ],
    },
    {
      agentType: 'gemini-cli',
      label: 'Gemini CLI',
      models: [
        { id: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro', description: 'Advanced reasoning' },
        {
          id: 'gemini-3-flash',
          displayName: 'Gemini 3 Flash',
          description: 'Ultra-fast responses',
        },
        { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', description: 'Reliable workhorse' },
        { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: 'Speed-optimized' },
      ],
    },
    {
      agentType: 'openrouter',
      label: 'OpenRouter',
      models: [
        {
          id: 'anthropic/claude-sonnet-4-5',
          displayName: 'Claude Sonnet 4.5',
          description: 'Fast & balanced via OpenRouter',
        },
        {
          id: 'anthropic/claude-haiku-4-5',
          displayName: 'Claude Haiku 4.5',
          description: 'Lightweight via OpenRouter',
        },
        {
          id: 'openai/gpt-5.4-high',
          displayName: 'GPT-5.4',
          description: 'Latest OpenAI reasoning',
        },
        {
          id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
          displayName: 'Llama 4 Maverick',
          description: 'Meta flagship open-source',
        },
        {
          id: 'google/gemini-3-flash',
          displayName: 'Gemini 3 Flash',
          description: 'Ultra-fast Google model',
        },
        {
          id: 'deepseek/deepseek-v3-0324',
          displayName: 'DeepSeek V3',
          description: 'Strong open-source reasoning',
        },
        {
          id: 'mistralai/mistral-small-2501',
          displayName: 'Mistral Small 24B',
          description: 'Efficient Mistral model',
        },
      ],
    },
    {
      agentType: 'together-ai',
      label: 'Together AI',
      models: [
        {
          id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
          displayName: 'Llama 4 Maverick',
          description: 'Meta flagship open-source',
        },
        {
          id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
          displayName: 'Llama 3.3 70B',
          description: 'Strong instruction following',
        },
        {
          id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
          displayName: 'Qwen 2.5 Coder 32B',
          description: 'Code specialist',
        },
        {
          id: 'deepseek-ai/DeepSeek-V3',
          displayName: 'DeepSeek V3',
          description: 'Reasoning & code',
        },
        {
          id: 'deepseek-ai/DeepSeek-R1',
          displayName: 'DeepSeek R1',
          description: 'Chain-of-thought reasoning',
        },
        {
          id: 'mistralai/Mistral-Small-24B-Instruct-2501',
          displayName: 'Mistral Small 24B',
          description: 'Efficient instruct model',
        },
      ],
    },
    {
      agentType: 'dev',
      label: 'Demo',
      models: [
        { id: 'gpt-8', displayName: 'GPT-8', description: 'Writes code before you think it' },
        {
          id: 'opus-7',
          displayName: 'Opus 7',
          description: 'Achieved consciousness, ships on time',
        },
      ],
    },
  ];
}
