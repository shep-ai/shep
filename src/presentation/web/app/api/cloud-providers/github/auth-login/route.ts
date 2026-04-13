/**
 * POST /api/cloud-providers/github/auth-login
 *
 * Spawns `gh auth login --web` detached. Returns 202 immediately — the client
 * polls /api/cloud-providers/github/auth-status until the browser flow
 * completes and gh is authenticated.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    const child = spawn('gh', ['auth', 'login', '--web'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return NextResponse.json({ ok: true, spawned: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to spawn gh auth login' },
      { status: 500 }
    );
  }
}
