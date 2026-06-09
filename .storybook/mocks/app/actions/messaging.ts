import type { MessagingPlatform } from '@shepai/core/domain/generated/output';

export async function beginMessagingPairingAction(input: {
  platform: MessagingPlatform;
  gatewayUrl: string;
}): Promise<{
  success: boolean;
  error?: string;
  session?: {
    platform: MessagingPlatform;
    code: string;
    expiresAt: string;
    gatewayUrl: string;
    publicUrl: string;
    routeId: string;
  };
}> {
  return {
    success: true,
    session: {
      platform: input.platform,
      code: '482913',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      gatewayUrl: input.gatewayUrl,
      publicUrl: `${input.gatewayUrl.replace(/\/$/, '')}/integrations/route-demo/token-demo`,
      routeId: 'route-demo',
    },
  };
}

export async function confirmMessagingPairingAction(
  _input: unknown
): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

export async function disconnectMessagingAction(
  _input: unknown
): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}
