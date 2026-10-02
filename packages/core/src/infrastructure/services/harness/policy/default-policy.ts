/**
 * Builtin default permission policy for the harness (spec 119).
 *
 * Kept as YAML text (the same format repositories use in
 * `.shep/harness/policies/*.yaml`) so `shep harness init` can show it and
 * users can copy rules. Precedence is deny > ask > allow; `hard: true` rules
 * can never be approved, granted or overridden by AI judgment.
 */
export const DEFAULT_POLICY_SOURCE = 'builtin:default';

export const DEFAULT_POLICY_YAML = `version: 1
rules:
  - id: deny-secret-files
    effect: deny
    hard: true
    reason: Credential and key files are never read or written by agents
    when:
      path_matches:
        - "**/.env"
        - "**/.env.local"
        - "**/.env.*.local"
        - "**/.env.prod*"
        - "**/.env.staging*"
        - "**/.env.development*"
        - "**/.env.test*"
        - "~/.ssh/**"
        - "**/*.pem"
        - "**/*.p12"
        - "**/id_rsa*"
        - "**/id_ed25519*"
        - "**/id_ecdsa*"
        - "~/.aws/**"
        - "~/.config/gcloud/**"
        - "~/.netrc"
        - "~/.npmrc"
        - "~/.shep/secret.key"

  - id: deny-git-push
    effect: deny
    reason: Shep pushes and opens pull requests in the merge step, not inside agent turns
    when:
      effect_category: [git_push]

  - id: deny-delete-outside-repo
    effect: deny
    hard: true
    reason: Agents never delete files outside the repository
    when:
      access: [delete]
      outside_repo: true

  - id: ask-write-outside-repo
    effect: ask
    reason: Writes outside the repository need your approval
    when:
      access: [write]
      outside_repo: true

  - id: ask-read-outside-repo
    effect: ask
    reason: Reading files outside the repository needs your approval
    when:
      access: [read, execute]
      outside_repo: true
      resource_kind: [path]

  - id: ask-destructive
    effect: ask
    reason: Deleting files, discarding changes or elevating privileges needs your approval
    when:
      effect_category: [delete, destructive_git, privilege]

  - id: ask-network-egress
    effect: ask
    reason: Network access needs your approval
    when:
      effect_category: [network]

  - id: ask-dependency-change
    effect: ask
    reason: Changing dependencies needs your approval
    when:
      effect_category: [dependency]

  - id: ask-unpredictable-command
    effect: ask
    reason: Shep cannot predict what this command will do
    when:
      effect_category: [script, unknown]

  - id: allow-read-only
    effect: allow
    reason: Reading inside the repository is always allowed
    when:
      action_class: [read]

  - id: allow-worktree-write
    effect: allow
    reason: Editing files inside the repository is allowed
    when:
      action_class: [write]

  - id: allow-inspected-command
    effect: allow
    reason: The command was inspected and has no risky effects
    when:
      capability: [run_command, run_tests]
      no_effects: true
`;
