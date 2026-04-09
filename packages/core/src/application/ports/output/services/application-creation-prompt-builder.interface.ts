/**
 * Output port: builds the agent prompt for an Application's interactive
 * chat session. The builder returns TWO slots:
 *
 * - `systemPrompt` — persona + mission + tech stack + workflow + quality
 *   bar + definition of done. Handed to the agent SDK as `systemPrompt`
 *   so it applies to every turn. Never shown in the chat thread.
 * - `userMessage` — the user's verbatim description. Persisted as the
 *   first chat message of the interactive session and shown in the
 *   thread as-is.
 *
 * Splitting these prevents the chat UI from showing the multi-kilobyte
 * Shep brief as the first "user message" while still giving the agent
 * everything it needs to act autonomously.
 *
 * The application layer holds only the contract — the actual prompt
 * text lives in the infrastructure adapter under
 * `infrastructure/services/agents/application-creation/`.
 *
 * Reusable in different forms via:
 * - `overrides`: replace any single section's content per-call
 * - `extras`:    append free-form sections after the defaults
 *
 * Both leave the rest of the template untouched, so callers don't
 * need to fork the whole thing to tweak one piece.
 */

export interface ApplicationCreationPromptAttachment {
  /** Display name shown to the agent in the attachments block. */
  name: string;
  /** Absolute path on disk that the agent can read with its file tools. */
  path: string;
  /** Optional user note explaining what the file is or how to use it. */
  notes?: string;
}

/**
 * Names of the static sections that make up an application-creation prompt.
 * Adapters must support every key here. `brand` is intentionally separate
 * from `role` so a white-label deployment can swap the Shep persona without
 * touching the agent's technical role.
 */
export type ApplicationCreationPromptSectionKey =
  | 'brand'
  | 'role'
  | 'mission'
  | 'techStack'
  | 'workflow'
  | 'quality'
  | 'userInteraction'
  | 'outputContract';

export type ApplicationCreationPromptSections = Record<ApplicationCreationPromptSectionKey, string>;

/**
 * Concrete, per-call workspace facts the agent must know up front so
 * it doesn't waste turns running `pwd` / `ls` / `git status` to
 * discover where it is. Rendered as a dynamic "Environment" section.
 */
export interface ApplicationCreationPromptWorkspace {
  /**
   * Absolute path the agent is running inside — always forward-slash
   * normalized. This is the Shep project folder that was scaffolded
   * moments before the prompt fires, already `git init`'ed with an
   * initial commit. The agent can assume an empty directory.
   */
  workingDirectory: string;
  /**
   * Optional: the OS family the agent will be shelling out on.
   * `'posix' | 'windows'`. Lets the prompt mention forward vs back
   * slashes and which shell quoting rules apply. Defaults to 'posix'.
   */
  platform?: 'posix' | 'windows';
}

export interface ApplicationCreationPromptInput {
  /** The user's plain-language application description. Required. */
  description: string;
  /**
   * Concrete workspace facts (cwd, platform) rendered into the system
   * prompt so the agent knows exactly where it is before starting.
   */
  workspace?: ApplicationCreationPromptWorkspace;
  /** Optional file attachments the agent should consider before starting. */
  attachments?: ApplicationCreationPromptAttachment[];
  /**
   * Per-call override for any default section. Use this to swap one
   * section's content (e.g. a different tech stack for a Vue variant)
   * without forking the whole template.
   */
  overrides?: Partial<ApplicationCreationPromptSections>;
  /**
   * Free-form extra sections appended after the static sections. Use
   * for one-off context the caller wants to inject (e.g. project
   * constraints). Extras land in the system prompt alongside the
   * static sections, NOT in the user message.
   */
  extras?: string[];
}

/**
 * Output of building an application-creation prompt. Intentionally
 * split so the chat surface can show a clean user message while the
 * agent still receives the full Shep brief.
 */
export interface ApplicationCreationPromptOutput {
  /**
   * Agent system prompt — persona, role, mission, tech stack, workflow,
   * quality bar, user-interaction policy, definition of done, plus any
   * extras and attachments. Handed to the agent SDK as `systemPrompt`.
   * Never appears in the chat thread.
   */
  systemPrompt: string;
  /**
   * User-facing chat message — the user's verbatim description,
   * trimmed. Persisted as the first user message of the interactive
   * session and displayed in the chat thread as-is.
   */
  userMessage: string;
}

export interface IApplicationCreationPromptBuilder {
  /**
   * Compose the application-creation prompt, split into the agent
   * system prompt and the user-facing chat message.
   *
   * @throws if `input.description` is empty or whitespace.
   */
  build(input: ApplicationCreationPromptInput): ApplicationCreationPromptOutput;
}
