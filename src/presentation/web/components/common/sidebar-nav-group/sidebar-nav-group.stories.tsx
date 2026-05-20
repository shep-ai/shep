import type { Meta, StoryObj } from '@storybook/react';
import { Bot, MessageCircleQuestion, ShieldCheck, GraduationCap, Users } from 'lucide-react';
import { SidebarProvider, SidebarMenu } from '@/components/ui/sidebar';
import { SidebarNavGroup } from './sidebar-nav-group';

const meta: Meta<typeof SidebarNavGroup> = {
  title: 'Composed/SidebarNavGroup',
  component: SidebarNavGroup,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <SidebarProvider>
        <SidebarMenu>
          <Story />
        </SidebarMenu>
      </SidebarProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const collaborationChildren = [
  {
    icon: MessageCircleQuestion,
    label: 'Agent Questions',
    href: '/agent-questions',
    badge: 3,
  },
  {
    icon: ShieldCheck,
    label: 'Supervisor',
    href: '/supervisor',
  },
  {
    icon: Bot,
    label: 'Agents',
    href: '/agents',
  },
  {
    icon: GraduationCap,
    label: 'Get started',
    href: '/onboarding',
  },
];

/** Default — group is closed; clicking the parent expands it. */
export const Default: Story = {
  args: {
    icon: Users,
    label: 'Collaboration',
    items: collaborationChildren,
  },
};

/** Auto-expands when a child is the current route. */
export const ChildActive: Story = {
  args: {
    icon: Users,
    label: 'Collaboration',
    items: collaborationChildren.map((c) =>
      c.href === '/supervisor' ? { ...c, active: true } : c
    ),
  },
};

/** Parent badge — typically the sum of unread/pending items across children. */
export const WithBadge: Story = {
  args: {
    icon: Users,
    label: 'Collaboration',
    badge: 5,
    items: collaborationChildren,
  },
};

/** Single child — degenerate case; still renders the toggle. */
export const SingleChild: Story = {
  args: {
    icon: Users,
    label: 'Collaboration',
    items: collaborationChildren.slice(0, 1),
  },
};
