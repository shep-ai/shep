/**
 * Sample chat blocks (spec 137) shared by stories and tests.
 */

import { ChatBlockType, type ChatBlock } from '@shepai/core/domain/generated/output';

export const specReviewBlock: ChatBlock = {
  id: 'block-spec',
  type: ChatBlockType.SpecReview,
  title: 'Login PRD',
  markdown: `## Goals

- Users sign in with email and a magic link
- Sessions last 30 days

## Out of scope

- Social login (next quarter)

| Metric | Target |
| --- | --- |
| Sign-in success | 98% |`,
};

export const planCardBlock: ChatBlock = {
  id: 'block-plan',
  type: ChatBlockType.PlanCard,
  title: 'Add dark mode',
  markdown: `1. Add color tokens for both themes
2. Add a theme toggle to the header
3. Persist the choice in local storage
4. Cover the toggle with a component test`,
};

export const htmlPreviewBlock: ChatBlock = {
  id: 'block-preview',
  type: ChatBlockType.HtmlPreview,
  title: 'Pricing card',
  html: `<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f8fafc; }
  .card { max-width: 260px; border-radius: 12px; background: white; padding: 20px;
    box-shadow: 0 4px 16px rgb(15 23 42 / 0.08); }
  .price { font-size: 32px; font-weight: 700; color: #0f172a; }
  button { margin-top: 12px; width: 100%; border: 0; border-radius: 8px; padding: 10px;
    background: #7c3aed; color: white; font-weight: 600; }
</style>
<div class="card"><div>Pro</div><div class="price">$10/mo</div><button>Choose Pro</button></div>`,
};
