import type { StorybookConfig } from '@storybook/react-vite';
import { resolve } from 'path';

const config: StorybookConfig = {
  stories: [
    '../src/presentation/web/**/*.stories.@(js|jsx|mjs|ts|tsx|mdx)',
    '../src/presentation/web/docs/**/*.mdx',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-links',
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../src/presentation/web/public'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  viteFinal: async (config) => {
    const tailwindcss = (await import('@tailwindcss/vite')).default;
    const { mergeConfig } = await import('vite');

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      // Mock ChatTab (requires QueryClient, SSE, etc. unavailable in Storybook)
      '@/components/features/chat/ChatTab': resolve(
        __dirname,
        'mocks/components/features/chat/ChatTab.tsx'
      ),
      '@/components': resolve(__dirname, '../src/presentation/web/components'),
      '@/lib': resolve(__dirname, '../src/presentation/web/lib'),
      '@/hooks': resolve(__dirname, '../src/presentation/web/hooks'),
      '@/types': resolve(__dirname, '../src/presentation/web/types'),
      // Mock server actions (Node.js/DI deps unavailable in Storybook)
      '@/app/actions': resolve(__dirname, 'mocks/app/actions'),
      // Mock Next.js in Storybook (no Next runtime; avoids process is not defined)
      'next/navigation': resolve(__dirname, 'next-navigation-mock.ts'),
      'next/link': resolve(__dirname, 'next-link-mock.tsx'),
      'next/image': resolve(__dirname, 'next-image-mock.tsx'),
    };

    config.define = {
      ...config.define,
      'process.env.NODE_ENV': JSON.stringify('development'),
    };

    return mergeConfig(config, { plugins: [tailwindcss()] });
  },
};

export default config;
