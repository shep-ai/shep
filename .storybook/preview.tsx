import type { Preview } from '@storybook/react';
import React, { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import webI18n from '../src/presentation/web/lib/i18n';
import '../src/presentation/web/app/globals.css';
// Ensure i18n singleton is initialized before any stories render
import '../src/presentation/web/lib/i18n';

// Provides the web i18next instance so components using `useTranslation()`
// render real strings instead of raw key paths.
const I18nDecorator = (Story: React.FC) => (
  <I18nextProvider i18n={webI18n}>
    <Story />
  </I18nextProvider>
);

// Decorator to handle theme based on background color
const ThemeDecorator = (
  Story: React.FC,
  context: { globals: { backgrounds?: { value?: string } } }
) => {
  const isDark = context.globals?.backgrounds?.value === '#0a0a0a';

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <div className="min-h-[100px] font-sans antialiased">
      <Story />
    </div>
  );
};

// Applies full-page context background to all Drawers/ stories automatically
const DrawerPageDecorator = (Story: React.FC, context: { title?: string }) => {
  if (!context.title?.startsWith('Drawers/')) {
    return <Story />;
  }
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0a0a0a' },
      ],
    },
    layout: 'centered',
    options: {
      storySort: {
        order: ['Design System', 'Primitives', 'Composed', 'Layout', 'Features'],
      },
    },
  },
  decorators: [I18nDecorator, ThemeDecorator, DrawerPageDecorator],
};

export default preview;
