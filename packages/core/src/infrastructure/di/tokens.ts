/**
 * DI token constants.
 *
 * Tsyringe accepts plain strings as registration tokens, and the bulk of this
 * codebase wires services through inline string literals at both
 * `container.register(...)` and `@inject(...)` sites. That convention is
 * preserved — these constants are *additive* and exported only for the
 * feature-098 bedrock surfaces, where multiple files (the registration
 * module, the use cases, and the DI smoke test) reference the same token and
 * a typo in any of them would silently break resolution.
 *
 * Keep this file additive. Do NOT move existing inline tokens here — that's
 * an unrelated refactor.
 */

/** Resolves to `BedrockIntegrationService`. */
export const IBedrockIntegrationServiceToken = 'IBedrockIntegrationService' as const;

/** Resolves to `ClaudeSettingsReconciler`. */
export const IClaudeSettingsReconcilerToken = 'IClaudeSettingsReconciler' as const;

/** Resolves to `EnableBedrockForApplicationUseCase`. */
export const EnableBedrockForApplicationUseCaseToken =
  'EnableBedrockForApplicationUseCase' as const;

/** Resolves to `RunBedrockLifecycleUseCase`. */
export const RunBedrockLifecycleUseCaseToken = 'RunBedrockLifecycleUseCase' as const;

/** Resolves to `CheckBedrockHealthUseCase`. */
export const CheckBedrockHealthUseCaseToken = 'CheckBedrockHealthUseCase' as const;

/** Resolves to `FileSystemBedrockMemoryReader`. */
export const IBedrockMemoryReaderToken = 'IBedrockMemoryReader' as const;

/** Resolves to `EnableBedrockForTargetUseCase`. */
export const EnableBedrockForTargetUseCaseToken = 'EnableBedrockForTargetUseCase' as const;

/** Resolves to `GetBedrockMemorySnapshotUseCase`. */
export const GetBedrockMemorySnapshotUseCaseToken = 'GetBedrockMemorySnapshotUseCase' as const;
