/**
 * Platform Agent Auth Detector Service
 *
 * Concrete adapter for IAgentAuthDetectorService. Detects whether the user
 * is authenticated with a given AI coding agent using a two-tier strategy:
 *
 *   Tier 1 (instant, ~5ms): env vars + credentials file existence + macOS
 *   Keychain entry. No subprocess.
 *
 *   Tier 2 (subprocess, ~200ms): runs the agent's `auth status` subcommand
 *   when one exists. Skipped for Claude Code (no non-interactive auth
 *   subcommand — interactive `claude auth status` hangs and gets killed).
 *
 * Conservative by design: any detection failure returns false rather than
 * throwing, so the UI can show "needs auth" instead of crashing.
 *
 * Cross-platform: macOS uses Keychain via `security`, Linux/Windows fall
 * back to the file-based credential location.
 */

import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

import { injectable } from 'tsyringe';

import { AgentType } from '../../../domain/generated/output.js';
import type { IAgentAuthDetectorService } from '../../../application/ports/output/services/agent-auth-detector.interface.js';
import { IS_WINDOWS } from '../../platform.js';

const IS_MACOS = platform() === 'darwin';

/**
 * On macOS, Claude Code stores OAuth credentials in the Keychain under the
 * service name "Claude Code-credentials" (not in ~/.claude/.credentials.json).
 * Use `security find-generic-password` to detect the entry without reading it.
 */
function macKeychainHasClaudeCreds(): boolean {
  if (!IS_MACOS) return false;
  try {
    execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials'], {
      stdio: 'ignore',
      timeout: 1500,
    });
    return true;
  } catch {
    return false;
  }
}

@injectable()
export class PlatformAgentAuthDetectorService implements IAgentAuthDetectorService {
  async isAuthenticated(agentType: AgentType, binaryName: string | null): Promise<boolean> {
    // Tier 1: instant heuristics
    if (!this.tier1AuthCheck(agentType)) {
      return false;
    }

    // Tier 2: optional subprocess verify (best-effort, ~200ms)
    if (binaryName) {
      return this.tier2AuthVerify(agentType, binaryName);
    }
    return true;
  }

  /**
   * Instant credential/env check (~5ms, no subprocess).
   * Returns true if credentials likely exist for this agent type.
   */
  private tier1AuthCheck(agentType: AgentType): boolean {
    const home = homedir();

    switch (agentType) {
      case AgentType.ClaudeCode: {
        if (process.env['ANTHROPIC_API_KEY']) return true;
        if (process.env['CLAUDE_CODE_USE_BEDROCK']) return true;
        if (process.env['CLAUDE_CODE_USE_VERTEX']) return true;
        if (process.env['CLAUDE_CODE_OAUTH_TOKEN']) return true;
        // macOS: credentials live in Keychain (no .credentials.json on disk).
        if (macKeychainHasClaudeCreds()) return true;
        // Linux / Windows: file-based credentials.
        const credPath = join(home, '.claude', '.credentials.json');
        return existsSync(credPath);
      }
      case AgentType.Cursor: {
        if (process.env['CURSOR_API_KEY']) return true;
        // Cursor Agent stores creds after `agent login` — check common locations
        const cursorDir = join(home, '.cursor');
        return existsSync(cursorDir);
      }
      case AgentType.GeminiCli: {
        if (process.env['GEMINI_API_KEY']) return true;
        if (process.env['GOOGLE_API_KEY']) return true;
        if (process.env['GOOGLE_APPLICATION_CREDENTIALS']) return true;
        const accountsPath = join(home, '.gemini', 'google_accounts.json');
        return existsSync(accountsPath);
      }
      case AgentType.CopilotCli: {
        if (process.env['GITHUB_TOKEN']) return true;
        if (process.env['GH_TOKEN']) return true;
        if (process.env['GITHUB_AUTH_TOKEN']) return true;
        // GitHub CLI stores creds after `gh auth login` — check common locations
        const ghDir = IS_WINDOWS ? join(home, '.copilot') : join(home, '.config', 'gh');
        return existsSync(ghDir);
      }

      default:
        // dev, aider, continue, codex-cli — assume no auth needed
        return true;
    }
  }

  /**
   * Subprocess verification (~200ms). Only called if tier 1 passes, to
   * confirm tokens aren't expired.
   */
  private tier2AuthVerify(agentType: AgentType, binaryName: string): Promise<boolean> {
    return new Promise((resolveAuth) => {
      let cmd: string;
      let args: string[];

      switch (agentType) {
        case AgentType.ClaudeCode:
          // Claude Code has no non-interactive `auth status` subcommand. Running
          // `claude auth status` launches an interactive session that hangs and
          // gets killed by the timeout, producing a false negative. Trust tier 1
          // (env vars / Keychain on macOS / .credentials.json elsewhere).
          resolveAuth(true);
          return;
        case AgentType.Cursor:
          cmd = binaryName;
          args = ['status'];
          break;
        case AgentType.CopilotCli:
          cmd = 'gh';
          args = ['auth', 'status'];
          break;
        default:
          // No tier 2 command available — trust tier 1
          resolveAuth(true);
          return;
      }

      try {
        const opts = IS_WINDOWS ? { timeout: 5000, windowsHide: true } : { timeout: 5000 };
        execFile(cmd, args, opts, (error) => {
          resolveAuth(!error);
        });
      } catch {
        resolveAuth(false);
      }
    });
  }
}
