'use client';

/**
 * Centralized provider icons for the cloud-deploy dropdown.
 *
 * Inlined SVG paths copied from `simple-icons` (CC0, verified against the
 * 16.x release). Each icon is a plain SVG React component that accepts
 * `className` + standard SVG props so the provider list can size them
 * uniformly. Brand hex colors are exposed via `CLOUD_PROVIDER_BRAND_HEX`
 * so the list can colorize the icon per provider without baking a `fill`
 * into the SVG (lets callers force a neutral tint in disabled states).
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

/** Vercel — simple-icons `vercel`. Solid triangle. */
export function VercelIcon(props: IconProps) {
  return <BrandSvg d="m12 1.608 12 20.784H0Z" {...props} />;
}

/** Netlify — simple-icons `netlify`. */
export function NetlifyIcon(props: IconProps) {
  return (
    <BrandSvg
      d="M6.49 19.04h-.23L5.13 17.9v-.23l1.73-1.71h1.2l.15.15v1.2L6.5 19.04ZM5.13 6.31V6.1l1.13-1.13h.23L8.2 6.68v1.2l-.15.15h-1.2L5.13 6.31Zm9.96 9.09h-1.65l-.14-.13v-3.83c0-.68-.27-1.2-1.1-1.23-.42 0-.9 0-1.43.02l-.07.08v4.96l-.14.14H8.9l-.13-.14V8.73l.13-.14h3.7a2.6 2.6 0 0 1 2.61 2.6v4.08l-.13.14Zm-8.37-2.44H.14L0 12.82v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14Zm17.14 0h-6.58l-.14-.14v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14ZM11.05 6.55V1.64l.14-.14h1.65l.14.14v4.9l-.14.14h-1.65l-.14-.13Zm0 15.81v-4.9l.14-.14h1.65l.14.13v4.91l-.14.14h-1.65l-.14-.14Z"
      {...props}
    />
  );
}

/** AWS Amplify — simple-icons does NOT ship an AWS Amplify brand mark
 *  (AWS trademark restrictions), so we fall back to a stylised "A" chevron
 *  that reads as "AWS-ish" without infringing. Users never deploy here in
 *  v1 — it's a "Coming soon" row — so a perfect brand match isn't worth
 *  the legal headache. */
export function AwsAmplifyIcon(props: IconProps) {
  return (
    <BrandSvg
      d="M11.58 2.1 1.15 20.87h4.33l1.9-3.5h9.24l1.9 3.5h4.33L12.42 2.1h-.84Zm.42 5.6 3.12 5.73H8.88L12 7.7Z"
      {...props}
    />
  );
}

/** Google Cloud — simple-icons `googlecloud`. */
export function GcpCloudRunIcon(props: IconProps) {
  return (
    <BrandSvg
      d="M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z"
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
  [CloudDeploymentProvider.Vercel]: VercelIcon,
  [CloudDeploymentProvider.Netlify]: NetlifyIcon,
  [CloudDeploymentProvider.AwsAmplify]: AwsAmplifyIcon,
  [CloudDeploymentProvider.GcpCloudRun]: GcpCloudRunIcon,
};

/** Brand hex colors from the simple-icons metadata (minus the leading `#`).
 *  Used by ProviderList so each row's icon renders in the real brand color
 *  when enabled, and falls back to the muted token when disabled. */
export const CLOUD_PROVIDER_BRAND_HEX: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: '#F38020',
  [CloudDeploymentProvider.Vercel]: '#000000',
  [CloudDeploymentProvider.Netlify]: '#00C7B7',
  [CloudDeploymentProvider.AwsAmplify]: '#FF9900',
  [CloudDeploymentProvider.GcpCloudRun]: '#4285F4',
};
