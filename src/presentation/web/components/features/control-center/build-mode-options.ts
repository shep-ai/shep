/**
 * Build modes offered by the "start from a prompt" composer.
 *
 * Every mode states what it does and which stack it produces, because the
 * modes are two different products: Spec-driven and Fast are the
 * stack-agnostic path; Quick prototype is the opinionated template
 * (Vite + React + Tailwind + shadcn, no spec phase). Hiding that difference
 * is what made users mistake the template for Shep's SDD orchestrator.
 */

import type { ElementType } from 'react';
import { ClipboardList, LayoutGrid, Zap } from 'lucide-react';
import { BuildMode } from '@shepai/core/domain/generated/output';

export type ComposerBuildMode = BuildMode.Spec | BuildMode.Fast | BuildMode.Application;

/** Dropdown and Alt+Shift+M cycle order — the spec-driven path comes first. */
export const COMPOSER_BUILD_MODES: readonly ComposerBuildMode[] = [
  BuildMode.Spec,
  BuildMode.Fast,
  BuildMode.Application,
];

/** Mode on surfaces that can start Features (the Control Center canvas). */
export const FEATURE_SURFACE_DEFAULT_MODE: ComposerBuildMode = BuildMode.Spec;

/** The Vite + shadcn prototype template — the only mode where Features are unavailable. */
export const PROTOTYPE_MODE: ComposerBuildMode = BuildMode.Application;

export interface ComposerBuildModeConfig {
  icon: ElementType;
  /** i18n key + English fallback for the short label. */
  labelKey: string;
  label: string;
  /** i18n key + English fallback for what the mode does. */
  descriptionKey: string;
  description: string;
  /** i18n key + English fallback for the stack the mode produces. */
  stackKey: string;
  stack: string;
  placeholder: string;
  suggestions: string[];
}

export const COMPOSER_BUILD_MODE_CONFIG: Record<ComposerBuildMode, ComposerBuildModeConfig> = {
  [BuildMode.Spec]: {
    icon: ClipboardList,
    labelKey: 'emptyState.modes.spec.label',
    label: 'Spec-driven',
    descriptionKey: 'emptyState.modes.spec.description',
    description:
      'Requirements, research and a plan first — you approve them before any code is written.',
    stackKey: 'emptyState.modes.spec.stack',
    stack: 'Any stack, chosen during research',
    placeholder: 'Implement a role-based access control system with audit logging...',
    suggestions: [
      'OAuth2 authentication with SSO and MFA support',
      'Event-driven notification system with email and push',
      'REST API with versioning, rate limiting, and OpenAPI docs',
      'Data pipeline with ETL, validation, and monitoring',
    ],
  },
  [BuildMode.Fast]: {
    icon: Zap,
    labelKey: 'emptyState.modes.fast.label',
    label: 'Fast',
    descriptionKey: 'emptyState.modes.fast.description',
    description: 'Implements straight from your prompt, with no spec phase.',
    stackKey: 'emptyState.modes.fast.stack',
    stack: 'Any stack',
    placeholder: 'A CLI that renames photos by the date they were taken...',
    suggestions: [
      'A CLI that renames photos by the date they were taken',
      'A small REST API that shortens URLs',
      'A script that backs up a folder to S3 every night',
      'A Telegram bot that posts the daily weather',
    ],
  },
  [BuildMode.Application]: {
    icon: LayoutGrid,
    labelKey: 'emptyState.modes.application.label',
    label: 'Quick prototype',
    descriptionKey: 'emptyState.modes.application.description',
    description:
      'Instant web-app prototype from the Vite + shadcn template, with a live preview. No spec phase.',
    stackKey: 'emptyState.modes.application.stack',
    stack: 'Vite + React + Tailwind + shadcn',
    placeholder: 'Build a modern e-commerce storefront with product catalog...',
    suggestions: [
      'A landing page with hero, features, and pricing sections',
      'Full-stack SaaS app with auth, billing, and dashboard',
      'Mobile-first social media app with real-time chat',
      'Personal portfolio with blog and project showcase',
    ],
  },
};
