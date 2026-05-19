/**
 * Pipx Not Installed Error
 *
 * Thrown by the bedrock prerequisite verifier (and by the tool-installer
 * verify-then-install path) when the `pipx` binary cannot be located on
 * PATH. project-bedrock is installed via `pipx install project-bedrock`, so
 * a missing pipx blocks both install and lifecycle operations.
 *
 * The remediation string is platform-aware so presentation layers can
 * surface the correct install command directly.
 */
export class PipxNotInstalledError extends Error {
  readonly code = 'PIPX_NOT_INSTALLED';
  readonly remediation: string;

  constructor(platform: NodeJS.Platform = process.platform) {
    super('pipx is not installed or not on PATH');
    this.name = 'PipxNotInstalledError';
    this.remediation = remediationForPlatform(platform);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function remediationForPlatform(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin':
      return 'Install pipx with `brew install pipx && pipx ensurepath`, then reopen your terminal.';
    case 'linux':
      return 'Install pipx with `python3 -m pip install --user pipx && python3 -m pipx ensurepath`, then reopen your terminal.';
    case 'win32':
      return 'Install pipx with `py -m pip install --user pipx` then `py -m pipx ensurepath`, then reopen your terminal.';
    default:
      return 'Install pipx (see https://pipx.pypa.io/stable/installation/), then reopen your terminal.';
  }
}
