/**
 * WhatsApp Cloud API webhook (spec 101, task-14).
 *
 * GET  — Meta verification handshake (hub.mode / hub.verify_token / hub.challenge).
 * POST — inbound message delivery: verify the X-Hub-Signature-256 over the raw
 *        body, then hand the payload to the Cloud API gateway, which parses it
 *        and dispatches to the connection service's inbound handlers.
 *
 * Resolves the gateway by string token (no infrastructure import), keeping the
 * presentation layer thin. Only relevant when the Cloud API adapter is active.
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ISettingsRepository } from '@shepai/core/application/ports/output/repositories/settings.repository.interface';

interface CloudWebhookGateway {
  verifyWebhook(mode: string, token: string, challenge: string, verifyToken: string): string | null;
  verifySignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean;
  handleWebhook(payload: unknown): Promise<unknown>;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode') ?? '';
  const token = url.searchParams.get('hub.verify_token') ?? '';
  const challenge = url.searchParams.get('hub.challenge') ?? '';

  const settings = await resolve<ISettingsRepository>('ISettingsRepository').load();
  const verifyToken = settings?.whatsapp?.cloudApiVerifyToken;
  if (!verifyToken) {
    return new NextResponse('WhatsApp Cloud API not configured', { status: 403 });
  }

  const gateway = resolve<CloudWebhookGateway>('WhatsAppCloudApiGateway');
  const echo = gateway.verifyWebhook(mode, token, challenge, verifyToken);
  if (echo === null) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse(echo, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();

    const settings = await resolve<ISettingsRepository>('ISettingsRepository').load();
    const appSecret = settings?.whatsapp?.cloudApiAppSecret;
    if (!appSecret) {
      return new NextResponse('WhatsApp Cloud API not configured', { status: 403 });
    }

    const gateway = resolve<CloudWebhookGateway>('WhatsAppCloudApiGateway');
    const signature = request.headers.get('x-hub-signature-256') ?? undefined;
    if (!gateway.verifySignature(rawBody, signature, appSecret)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const payload: unknown = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    await gateway.handleWebhook(payload);
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/whatsapp/webhook]', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
