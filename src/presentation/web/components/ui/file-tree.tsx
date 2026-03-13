'use client';

import * as React from 'react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { FileIcon, FolderIcon, FolderOpenIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

/** A node in the file tree data model. */
export interface TreeViewElement {
  id: string;
  name: string;
  type?: 'file' | 'folder';
  isSelectable?: boolean;
  children?: TreeViewElement[];
  /** Optional custom icon for file nodes. */
  icon?: React.ReactNode;
  /** Optional badge/suffix rendered after the name (e.g. "+5 -2" for diffs). */
  badge?: React.ReactNode;
}

interface TreeContextValue {
  selectedId: string | undefined;
  expandedItems: string[];
  handleSelect: (id: string) => void;
  handleExpand: (id: string) => void;
  indicator: boolean;
}

const TreeContext = React.createContext<TreeContextValue | undefined>(undefined);

function useTree() {
  const ctx = React.useContext(TreeContext);
  if (!ctx) throw new Error('useTree must be used within a Tree');
  return ctx;
}

/* ─── Main Tree component ─── */

export interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  elements: TreeViewElement[];
  initialSelectedId?: string;
  initialExpandedItems?: string[];
  indicator?: boolean;
  onSelectChange?: (id: string) => void;
}

function collectFolderIds(elements: TreeViewElement[]): string[] {
  const ids: string[] = [];
  for (const el of elements) {
    if (el.children && el.children.length > 0) {
      ids.push(el.id);
      ids.push(...collectFolderIds(el.children));
    }
  }
  return ids;
}

export function Tree({
  elements,
  initialSelectedId,
  initialExpandedItems,
  indicator = true,
  onSelectChange,
  className,
  ...props
}: TreeProps) {
  const [selectedId, setSelectedId] = React.useState(initialSelectedId);
  const [expandedItems, setExpandedItems] = React.useState<string[]>(
    () => initialExpandedItems ?? collectFolderIds(elements)
  );

  const handleSelect = React.useCallback(
    (id: string) => {
      setSelectedId(id);
      onSelectChange?.(id);
    },
    [onSelectChange]
  );

  const handleExpand = React.useCallback((id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const ctx = React.useMemo<TreeContextValue>(
    () => ({ selectedId, expandedItems, handleSelect, handleExpand, indicator }),
    [selectedId, expandedItems, handleSelect, handleExpand, indicator]
  );

  return (
    <TreeContext.Provider value={ctx}>
      <div className={cn('relative overflow-hidden rounded-md', className)} {...props}>
        <ScrollArea className="h-full">
          <AccordionPrimitive.Root
            type="multiple"
            value={expandedItems}
            onValueChange={setExpandedItems}
            className="flex flex-col gap-px"
          >
            {elements.map((el) => (
              <TreeNode key={el.id} element={el} depth={0} />
            ))}
          </AccordionPrimitive.Root>
        </ScrollArea>
      </div>
    </TreeContext.Provider>
  );
}

/* ─── Internal recursive node ─── */

function TreeNode({ element, depth }: { element: TreeViewElement; depth: number }) {
  const isFolder = element.type === 'folder' || (element.children && element.children.length > 0);

  if (isFolder) {
    return <FolderNode element={element} depth={depth} />;
  }
  return <FileNode element={element} depth={depth} fileIcon={element.icon} />;
}

function FolderNode({ element, depth }: { element: TreeViewElement; depth: number }) {
  const { selectedId, expandedItems, handleSelect, indicator } = useTree();
  const isSelected = selectedId === element.id;
  const isOpen = expandedItems.includes(element.id);

  return (
    <AccordionPrimitive.Item value={element.id} className="relative">
      {indicator && depth > 0 ? (
        <span
          className="bg-muted absolute top-0 left-3 h-full w-px"
          style={{ marginLeft: `${(depth - 1) * 16}px` }}
        />
      ) : null}
      <AccordionPrimitive.Trigger
        className={cn(
          'hover:bg-muted/80 flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-xs',
          isSelected && 'bg-muted'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={(e) => {
          if (element.isSelectable !== false) {
            e.stopPropagation();
            handleSelect(element.id);
          }
        }}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground h-3 w-3 shrink-0 transition-transform duration-150',
            isOpen && 'rotate-90'
          )}
        />
        {isOpen ? (
          <FolderOpenIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <FolderIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}
        <span className="text-foreground truncate">{element.name}</span>
      </AccordionPrimitive.Trigger>
      <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
        {element.children?.map((child) => (
          <TreeNode key={child.id} element={child} depth={depth + 1} />
        ))}
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

function FileNode({
  element,
  depth,
  fileIcon,
}: {
  element: TreeViewElement;
  depth: number;
  fileIcon?: React.ReactNode;
}) {
  const { selectedId, handleSelect, indicator } = useTree();
  const isSelected = selectedId === element.id;

  return (
    <div className="relative">
      {indicator && depth > 0 ? (
        <span
          className="bg-muted absolute top-0 left-3 h-full w-px"
          style={{ marginLeft: `${(depth - 1) * 16}px` }}
        />
      ) : null}
      <button
        type="button"
        className={cn(
          'hover:bg-muted/80 flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-xs',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        style={{ paddingLeft: `${depth * 16 + 8 + 16}px` }}
        onClick={() => element.isSelectable !== false && handleSelect(element.id)}
      >
        {fileIcon ?? <FileIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{element.name}</span>
        {element.badge ? <span className="shrink-0">{element.badge}</span> : null}
      </button>
    </div>
  );
}
