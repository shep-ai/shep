## Findings

- IStructuredAgentCaller validates JSON-schema output and accepts agentType and environment.
- domain/shared/space-environment.ts gives a space's environment and agent rules without a
  repository.
- Feature metadata generation already calls the agent with no tools.
