'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, FileText, Search, BookOpen } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { globalSearch } from '@/app/actions/global-search';

interface SearchResult {
  type: 'project' | 'workItem' | 'page';
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

export interface GlobalSearchDialogProps {
  className?: string;
}

export function GlobalSearchDialog({ className }: GlobalSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Register Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { results: searchResults } = await globalSearch(searchQuery);
      setResults(searchResults ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => performSearch(value), 200);
    },
    [performSearch]
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery('');
      setResults([]);
      router.push(result.url as never);
    },
    [router]
  );

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setQuery('');
      setResults([]);
    }
  }, []);

  const projectResults = results.filter((r) => r.type === 'project');
  const workItemResults = results.filter((r) => r.type === 'workItem');
  const pageResults = results.filter((r) => r.type === 'page');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="global-search-dialog"
        className="max-w-lg gap-0 overflow-hidden p-0"
      >
        <Command className={className}>
          <CommandInput
            placeholder="Search projects, work items, and pages..."
            value={query}
            onChange={handleQueryChange}
            data-testid="global-search-input"
          />
          <CommandList>
            {query.trim() && !loading && results.length === 0 ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : null}
            {loading ? (
              <div className="text-muted-foreground py-6 text-center text-xs">Searching...</div>
            ) : null}
            {projectResults.length > 0 ? (
              <CommandGroup>
                <div className="text-muted-foreground px-2 py-1.5 text-[10px] font-medium">
                  Projects
                </div>
                {projectResults.map((result) => (
                  <CommandItem
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    data-testid={`search-result-${result.id}`}
                  >
                    <FolderKanban className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="flex-1 truncate text-xs">{result.title}</span>
                    {result.subtitle ? (
                      <span className="text-muted-foreground ml-2 shrink-0 font-mono text-[10px]">
                        {result.subtitle}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {projectResults.length > 0 && workItemResults.length > 0 ? <CommandSeparator /> : null}
            {workItemResults.length > 0 ? (
              <CommandGroup>
                <div className="text-muted-foreground px-2 py-1.5 text-[10px] font-medium">
                  Work Items
                </div>
                {workItemResults.map((result) => (
                  <CommandItem
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    data-testid={`search-result-${result.id}`}
                  >
                    <FileText className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="flex-1 truncate text-xs">{result.title}</span>
                    {result.subtitle ? (
                      <span className="text-muted-foreground ml-2 shrink-0 font-mono text-[10px]">
                        {result.subtitle}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {pageResults.length > 0 ? (
              <>
                {projectResults.length > 0 || workItemResults.length > 0 ? (
                  <CommandSeparator />
                ) : null}
                <CommandGroup>
                  <div className="text-muted-foreground px-2 py-1.5 text-[10px] font-medium">
                    Pages
                  </div>
                  {pageResults.map((result) => (
                    <CommandItem
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      data-testid={`search-result-${result.id}`}
                    >
                      <BookOpen className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      <span className="flex-1 truncate text-xs">{result.title}</span>
                      {result.subtitle ? (
                        <span className="text-muted-foreground ml-2 shrink-0 font-mono text-[10px]">
                          {result.subtitle}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
            {!query.trim() && !loading ? (
              <div className="text-muted-foreground py-6 text-center text-xs">
                <Search className="mx-auto mb-2 h-5 w-5 opacity-20" />
                <p>Type to search projects, work items, and pages</p>
                <p className="mt-1 text-[10px]">
                  Press{' '}
                  <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
                    &#x2318;K
                  </kbd>{' '}
                  to open anytime
                </p>
              </div>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
