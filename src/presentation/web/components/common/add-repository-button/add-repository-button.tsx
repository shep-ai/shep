'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus, Github, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GitHubImportDialog } from '@/components/common/github-import-dialog';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { ReactFileManagerDialog } from '@/components/common/react-file-manager-dialog';
import { pickFolder } from './pick-folder';
import type { Repository } from '@shepai/core/domain/generated/output';

export interface AddRepositoryButtonProps {
  onSelect?: (path: string) => void;
  onGitHubImport?: (repository: Repository) => void;
}

export function AddRepositoryButton({ onSelect, onGitHubImport }: AddRepositoryButtonProps) {
  const { t } = useTranslation('web');
  const featureFlags = useFeatureFlags();
  const [loading, setLoading] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const { reactFileManager: useReactFileManager } = featureFlags;

  async function handleLocalFolder() {
    setPopoverOpen(false);
    if (loading) return;

    if (useReactFileManager) {
      setShowReactPicker(true);
      return;
    }

    setLoading(true);
    try {
      const path = await pickFolder();
      if (path) {
        onSelect?.(path);
      }
    } catch {
      // Native picker failed — fall back to React file manager
      setShowReactPicker(true);
    } finally {
      setLoading(false);
    }
  }

  function handleFromGitHub() {
    setPopoverOpen(false);
    setGithubDialogOpen(true);
  }

  function handleImportComplete(repository: Repository) {
    onGitHubImport?.(repository);
    if (repository.path) {
      onSelect?.(repository.path);
    }
  }

  function handleReactPickerSelect(path: string | null) {
    if (path) {
      onSelect?.(path);
    }
    setShowReactPicker(false);
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('addRepository.addRepository')}
                  data-testid="add-repository-button"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('addRepository.addRepository')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PopoverContent className="w-48 p-1" align="start">
          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
            onClick={handleLocalFolder}
            data-testid="add-repo-local-folder"
          >
            <FolderPlus className="h-4 w-4" />
            Local folder
          </button>
          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
            onClick={handleFromGitHub}
            data-testid="add-repo-from-github"
          >
            <Github className="h-4 w-4" />
            From GitHub
          </button>
        </PopoverContent>
      </Popover>

      <GitHubImportDialog
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        onImportComplete={handleImportComplete}
      />
      <ReactFileManagerDialog
        open={showReactPicker}
        onOpenChange={(open) => {
          if (!open) {
            setShowReactPicker(false);
          }
        }}
        onSelect={handleReactPickerSelect}
      />
    </>
  );
}
