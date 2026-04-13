'use client';

import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface PageEditorToolbarProps {
  editor: Editor;
}

interface ToolbarAction {
  icon: typeof Bold;
  label: string;
  action: () => void;
  isActive?: () => boolean;
}

export function PageEditorToolbar({ editor }: PageEditorToolbarProps) {
  const actions: (ToolbarAction | 'separator')[] = [
    {
      icon: Bold,
      label: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive('bold'),
    },
    {
      icon: Italic,
      label: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive('italic'),
    },
    {
      icon: Strikethrough,
      label: 'Strikethrough',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive('strike'),
    },
    {
      icon: Code,
      label: 'Inline Code',
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: () => editor.isActive('code'),
    },
    'separator',
    {
      icon: Heading1,
      label: 'Heading 1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editor.isActive('heading', { level: 1 }),
    },
    {
      icon: Heading2,
      label: 'Heading 2',
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive('heading', { level: 2 }),
    },
    {
      icon: Heading3,
      label: 'Heading 3',
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive('heading', { level: 3 }),
    },
    'separator',
    {
      icon: List,
      label: 'Bullet List',
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive('bulletList'),
    },
    {
      icon: ListOrdered,
      label: 'Ordered List',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive('orderedList'),
    },
    {
      icon: ListChecks,
      label: 'Task List',
      action: () => editor.chain().focus().toggleTaskList().run(),
      isActive: () => editor.isActive('taskList'),
    },
    'separator',
    {
      icon: Quote,
      label: 'Blockquote',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: () => editor.isActive('blockquote'),
    },
    {
      icon: Code2,
      label: 'Code Block',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => editor.isActive('codeBlock'),
    },
    {
      icon: Minus,
      label: 'Horizontal Rule',
      action: () => editor.chain().focus().setHorizontalRule().run(),
    },
    'separator',
    {
      icon: LinkIcon,
      label: 'Link',
      action: () => {
        const url = window.prompt('Enter URL');
        if (url) {
          editor.chain().focus().setLink({ href: url }).run();
        }
      },
      isActive: () => editor.isActive('link'),
    },
    {
      icon: ImageIcon,
      label: 'Image',
      action: () => {
        const url = window.prompt('Enter image URL');
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      },
    },
    {
      icon: TableIcon,
      label: 'Table',
      action: () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    'separator',
    {
      icon: Undo,
      label: 'Undo',
      action: () => editor.chain().focus().undo().run(),
    },
    {
      icon: Redo,
      label: 'Redo',
      action: () => editor.chain().focus().redo().run(),
    },
  ];

  return (
    <div
      data-testid="page-editor-toolbar"
      className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1"
    >
      {(() => {
        let sepCount = 0;
        return actions.map((item) => {
          if (item === 'separator') {
            sepCount++;
            return <div key={`sep-${String(sepCount)}`} className="bg-border mx-1 h-4 w-px" />;
          }

          const Icon = item.icon;
          const active = item.isActive?.();

          return (
            <Button
              key={item.label}
              variant="ghost"
              size="sm"
              className={cn('h-6 w-6 p-0', active && 'bg-accent')}
              onClick={item.action}
              title={item.label}
              data-testid={`toolbar-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          );
        });
      })()}
    </div>
  );
}
