import type { Meta, StoryObj } from '@storybook/react';
import { ProjectMembersPanel } from './project-members-panel';
import { ProjectRole } from '@shepai/core/domain/generated/output';
import type { PmProjectMember } from '@shepai/core/domain/generated/output';

const mockMembers: PmProjectMember[] = [
  {
    id: 'member-1',
    projectId: 'proj-1',
    userId: 'admin-user',
    role: ProjectRole.Admin,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'member-2',
    projectId: 'proj-1',
    userId: 'member-user',
    role: ProjectRole.Member,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  },
  {
    id: 'member-3',
    projectId: 'proj-1',
    userId: 'guest-user',
    role: ProjectRole.Guest,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-01'),
  },
];

const meta: Meta<typeof ProjectMembersPanel> = {
  title: 'Features/ProjectMembersPanel',
  component: ProjectMembersPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ProjectMembersPanel>;

export const AdminView: Story = {
  args: {
    projectId: 'proj-1',
    members: mockMembers,
    currentUserId: 'admin-user',
    onAddMember: async (input) => ({
      member: {
        id: 'new-member',
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }),
    onRemoveMember: async () => ({}),
    onUpdateRole: async () => ({}),
  },
};

export const MemberView: Story = {
  args: {
    projectId: 'proj-1',
    members: mockMembers,
    currentUserId: 'member-user',
    onAddMember: async () => ({ error: 'Only admins can add members' }),
    onRemoveMember: async () => ({ error: 'Only admins can remove members' }),
    onUpdateRole: async () => ({ error: 'Only admins can change roles' }),
  },
};

export const Empty: Story = {
  args: {
    projectId: 'proj-1',
    members: [],
    currentUserId: 'admin-user',
    onAddMember: async (input) => ({
      member: {
        id: 'first-member',
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }),
    onRemoveMember: async () => ({}),
    onUpdateRole: async () => ({}),
  },
};
