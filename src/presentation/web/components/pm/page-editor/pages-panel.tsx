'use client';

import { useState, useCallback } from 'react';
import { Plus, FileText, Trash2, Star, StarOff, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Page } from '@shepai/core/domain/generated/output';
import { PageEditor } from './page-editor';
import { createPage, updatePage, deletePage } from '@/app/actions/manage-pages';

export interface PagesPanelProps {
  projectId: string;
  pages: Page[];
  className?: string;
}

export function PagesPanel({ projectId, pages: initialPages, className }: PagesPanelProps) {
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  const selectedPage = pages.find((p) => p.id === selectedPageId);

  const rootPages = pages.filter((p) => !p.parentId);

  const getChildren = useCallback(
    (parentId: string) => pages.filter((p) => p.parentId === parentId),
    [pages]
  );

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;

    const result = await createPage({ projectId, title });
    if (result.page) {
      setPages((prev) => [...prev, result.page!]);
      setSelectedPageId(result.page.id);
      setNewTitle('');
      setIsCreating(false);
    }
  }, [projectId, newTitle]);

  const handleContentUpdate = useCallback(
    async (content: string) => {
      if (!selectedPageId) return;
      const result = await updatePage(selectedPageId, { content });
      if (result.page) {
        setPages((prev) => prev.map((p) => (p.id === result.page!.id ? result.page! : p)));
      }
    },
    [selectedPageId]
  );

  const handleTitleUpdate = useCallback(async (pageId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const result = await updatePage(pageId, { title: trimmed });
    if (result.page) {
      setPages((prev) => prev.map((p) => (p.id === result.page!.id ? result.page! : p)));
    }
    setEditingTitle(null);
  }, []);

  const handleDelete = useCallback(
    async (pageId: string) => {
      const result = await deletePage(pageId);
      if (!result.error) {
        setPages((prev) => prev.filter((p) => p.id !== pageId));
        if (selectedPageId === pageId) setSelectedPageId(null);
      }
    },
    [selectedPageId]
  );

  const handleToggleFavorite = useCallback(async (pageId: string, current: boolean) => {
    const result = await updatePage(pageId, { isFavorite: !current });
    if (result.page) {
      setPages((prev) => prev.map((p) => (p.id === result.page!.id ? result.page! : p)));
    }
  }, []);

  const renderPageItem = (page: Page, depth = 0) => {
    const children = getChildren(page.id);
    const isSelected = selectedPageId === page.id;
    const isEditing = editingTitle === page.id;

    return (
      <div key={page.id}>
        <div
          data-testid={`page-item-${page.id}`}
          className={cn(
            'group hover:bg-accent/50 flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs',
            isSelected && 'bg-accent'
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => setSelectedPageId(page.id)}
        >
          {children.length > 0 && (
            <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
          )}
          <FileText className="text-muted-foreground h-3 w-3 shrink-0" />
          {isEditing ? (
            <Input
              autoFocus
              defaultValue={page.title}
              className="h-5 text-xs"
              onBlur={(e) => handleTitleUpdate(page.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleUpdate(page.id, e.currentTarget.value);
                if (e.key === 'Escape') setEditingTitle(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTitle(page.id);
              }}
            >
              {page.title}
            </span>
          )}
          <div className="hidden gap-0.5 group-hover:flex">
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleFavorite(page.id, page.isFavorite);
              }}
              title={page.isFavorite ? 'Unfavorite' : 'Favorite'}
            >
              {page.isFavorite ? (
                <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
              ) : (
                <StarOff className="h-2.5 w-2.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(page.id);
              }}
              title="Delete page"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>
        {children.map((child) => renderPageItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <div data-testid="pages-panel" className={cn('flex h-full gap-0', className)}>
      {/* Sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium">Pages</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setIsCreating(true)}
            data-testid="create-page-btn"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {isCreating ? (
            <div className="mb-1 px-2">
              <Input
                autoFocus
                placeholder="Page title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewTitle('');
                  }
                }}
                onBlur={() => {
                  if (newTitle.trim()) handleCreate();
                  else {
                    setIsCreating(false);
                    setNewTitle('');
                  }
                }}
                className="h-6 text-xs"
                data-testid="new-page-input"
              />
            </div>
          ) : null}
          {rootPages.length === 0 && !isCreating ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="mb-2 h-5 w-5 opacity-20" />
              <p className="text-muted-foreground text-[10px]">No pages yet</p>
            </div>
          ) : (
            rootPages.map((page) => renderPageItem(page))
          )}
        </div>
      </div>

      {/* Editor pane */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedPage ? (
          <>
            <div className="border-b px-4 py-2">
              <h2 className="text-sm font-medium">{selectedPage.title}</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <PageEditor content={selectedPage.content ?? ''} onUpdate={handleContentUpdate} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-20" />
              <p className="text-muted-foreground text-xs">Select or create a page</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
