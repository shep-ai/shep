/**
 * Re-export PR & commit branding from the canonical location in git services.
 */
export {
  PR_BRANDING,
  COMMIT_CO_AUTHOR,
  applyPrBranding,
  applyCommitBranding,
} from '@/infrastructure/services/git/pr-branding.js';
