'use client';

/**
 * Centralized provider icons for the cloud-deploy dropdown.
 *
 * Inlined SVG paths (loosely based on brand marks) to avoid pulling in
 * `simple-icons` as a runtime dep. Each icon is a plain SVG React component
 * that accepts `className` + standard SVG props.
 *
 * Adding a new provider: drop a new component + map it in
 * `CLOUD_PROVIDER_ICONS` below. The Deploy dropdown reads from the map.
 */

import type { ReactElement, SVGProps } from 'react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';

type IconProps = SVGProps<SVGSVGElement>;

export function CloudflareIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      <path d="M16.5 16.3c.3-1.1-.2-2.2-1.3-2.4l-5.5-.1.8-2.8c.2-.6-.3-1.2-1-1.2h-3c-.3 0-.6.2-.7.5L5 12.9c-.7-.3-1.4-.3-2.1-.1A3 3 0 000 15.7c0 .3 0 .6.1.8.1.3.4.5.7.5h15c.4 0 .7-.3.7-.7zm3 .7c-.1 0-.3 0-.4-.1 1 .7 1.6 1.8 1.6 3 0 2.2-1.8 4-4 4H6.4c.2.2.4.4.6.5.9.6 2 .9 3.1.9h10.7c1.2 0 2.2-.8 2.2-2v-5.5c0-.5-.4-.8-.8-.8h-2.7z" />
    </svg>
  );
}

export function VercelIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      <path d="M12 2L2 22h20L12 2z" />
    </svg>
  );
}

export function NetlifyIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      <path d="M16.5 6L12 1.5 7.5 6H12l4.5 4.5V6zM1.5 12L6 16.5V12l4.5-4.5H6L1.5 12zM22.5 12L18 7.5V12l-4.5 4.5H18l4.5-4.5zM12 22.5l4.5-4.5H12l-4.5-4.5V18L12 22.5z" />
    </svg>
  );
}

export function AwsAmplifyIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      <path d="M6 4h3l6 16h-3l-1.4-4H7l-1.4 4H2L6 4zm1.2 9.6h3L8.6 8.2 7.2 13.6z" />
    </svg>
  );
}

export function GcpCloudRunIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.5 10.5h-3v3h-3v-3h-3v-3h3v-3h3v3h3v3z" />
    </svg>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      <path d="M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.4 1.2a11.7 11.7 0 016.2 0c2.4-1.6 3.4-1.2 3.4-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A12 12 0 0012 .3" />
    </svg>
  );
}

export const CLOUD_PROVIDER_ICONS: Record<
  CloudDeploymentProvider,
  (props: IconProps) => ReactElement
> = {
  [CloudDeploymentProvider.CloudflarePages]: CloudflareIcon,
  [CloudDeploymentProvider.Vercel]: VercelIcon,
  [CloudDeploymentProvider.Netlify]: NetlifyIcon,
  [CloudDeploymentProvider.AwsAmplify]: AwsAmplifyIcon,
  [CloudDeploymentProvider.GcpCloudRun]: GcpCloudRunIcon,
};
