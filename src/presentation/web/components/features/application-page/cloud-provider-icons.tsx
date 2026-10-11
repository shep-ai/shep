'use client';

/**
 * Centralized provider icons for the cloud-deploy dropdown.
 *
 * Inlined SVG paths copied from `simple-icons` (CC0, verified against the
 * 16.x release). Each icon is a plain SVG React component that accepts
 * `className` + standard SVG props so the provider list can size them
 * uniformly. Brand hex colors are exposed via `CLOUD_PROVIDER_BRAND_HEX`
 * so the list can colorize the icon per provider without baking a `fill`
 * into the SVG (lets callers keep a neutral tint where they need one).
 *
 * Adding a new provider: drop a new component + map it in
 * `CLOUD_PROVIDER_ICONS` below and add its hex to `CLOUD_PROVIDER_BRAND_HEX`.
 */

import type { ReactElement, SVGProps } from 'react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';

type IconProps = SVGProps<SVGSVGElement>;

/** Thin wrapper that injects the shared viewBox + xmlns so the per-icon
 *  components stay single-line path declarations. */
function BrandSvg({ d, ...props }: { d: string } & IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** Cloudflare Pages — simple-icons `cloudflarepages`. */
export function CloudflareIcon(props: IconProps) {
  return (
    <BrandSvg
      d="M10.715 14.32H5.442l-.64-1.203L13.673 0l1.397.579-1.752 9.112h5.24l.648 1.192L10.719 24l-1.412-.54ZM4.091 5.448a.5787.5787 0 1 1 0-1.1574.5787.5787 0 0 1 0 1.1574zm1.543 0a.5787.5787 0 1 1 0-1.1574.5787.5787 0 0 1 0 1.1574zm1.544 0a.5787.5787 0 1 1 0-1.1574.5787.5787 0 0 1 0 1.1574zm8.657-2.7h5.424l.772.771v16.975l-.772.772h-7.392l.374-.579h6.779l.432-.432V3.758l-.432-.432h-4.676l-.552 2.85h-.59l.529-2.877.108-.552ZM2.74 21.265l-.772-.772V3.518l.772-.771h7.677l-.386.579H2.98l-.432.432v16.496l.432.432h5.586l-.092.579zm1.157-1.93h3.28l-.116.58h-3.55l-.192-.193v-3.473l.578 1.158zm13.117 0 .579.58H14.7l.385-.58z"
      {...props}
    />
  );
}

/** GitHub — simple-icons `github`. */
export function GitHubIcon(props: IconProps) {
  return (
    <BrandSvg
      d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      {...props}
    />
  );
}

export const CLOUD_PROVIDER_ICONS: Record<
  CloudDeploymentProvider,
  (props: IconProps) => ReactElement
> = {
  [CloudDeploymentProvider.CloudflarePages]: CloudflareIcon,
};

/** Brand hex colors from the simple-icons metadata.
 *  Used by ProviderList and DeployPanel so each provider icon renders in
 *  its real brand color. */
export const CLOUD_PROVIDER_BRAND_HEX: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: '#F38020',
};
