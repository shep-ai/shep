'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ProjectRole } from '@shepai/core/domain/generated/output';
import type { PmProjectMember } from '@shepai/core/domain/generated/output';

export interface ProjectMembersPanelProps {
  projectId: string;
  members: PmProjectMember[];
  currentUserId: string;
  onAddMember: (input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
    actorId: string;
  }) => Promise<{ member?: PmProjectMember; error?: string }>;
  onRemoveMember: (input: {
    projectId: string;
    userId: string;
    actorId: string;
  }) => Promise<{ error?: string }>;
  onUpdateRole: (input: {
    projectId: string;
    userId: string;
    newRole: ProjectRole;
    actorId: string;
  }) => Promise<{ error?: string }>;
}

const ROLE_COLORS: Record<string, string> = {
  Admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  Member: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  Guest: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

export function ProjectMembersPanel({
  projectId,
  members: initialMembers,
  currentUserId,
  onAddMember,
  onRemoveMember,
  onUpdateRole,
}: ProjectMembersPanelProps) {
  const [members, setMembers] = useState<PmProjectMember[]>(initialMembers);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<ProjectRole>(ProjectRole.Member);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isCurrentUserAdmin = members.some(
    (m) => m.userId === currentUserId && m.role === ProjectRole.Admin
  );

  const handleAdd = useCallback(async () => {
    if (!newUserId.trim()) return;
    setLoading(true);
    setError(null);

    const result = await onAddMember({
      projectId,
      userId: newUserId.trim(),
      role: newRole,
      actorId: currentUserId,
    });

    if (result.error) {
      setError(result.error);
    } else if (result.member) {
      setMembers((prev) => [...prev, result.member!]);
      setNewUserId('');
      setNewRole(ProjectRole.Member);
    }
    setLoading(false);
  }, [newUserId, newRole, projectId, currentUserId, onAddMember]);

  const handleRemove = useCallback(
    async (userId: string) => {
      setError(null);
      const result = await onRemoveMember({ projectId, userId, actorId: currentUserId });
      if (result.error) {
        setError(result.error);
      } else {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      }
    },
    [projectId, currentUserId, onRemoveMember]
  );

  const handleRoleChange = useCallback(
    async (userId: string, role: ProjectRole) => {
      setError(null);
      const result = await onUpdateRole({
        projectId,
        userId,
        newRole: role,
        actorId: currentUserId,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
      }
    },
    [projectId, currentUserId, onUpdateRole]
  );

  return (
    <div data-testid="project-members-panel" className="space-y-4">
      <h3 className="text-lg font-semibold">Project Members</h3>

      {error ? (
        <div
          data-testid="members-error"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      <div className="divide-y rounded border">
        {members.map((member) => (
          <div
            key={member.id}
            data-testid={`member-row-${member.userId}`}
            className="flex items-center justify-between p-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{member.userId}</span>
              <Badge className={ROLE_COLORS[member.role] ?? ''} variant="secondary">
                {member.role}
              </Badge>
            </div>

            {isCurrentUserAdmin && member.userId !== currentUserId ? (
              <div className="flex items-center gap-2">
                <Select
                  value={member.role}
                  onValueChange={(value) => handleRoleChange(member.userId, value as ProjectRole)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ProjectRole.Admin}>Admin</SelectItem>
                    <SelectItem value={ProjectRole.Member}>Member</SelectItem>
                    <SelectItem value={ProjectRole.Guest}>Guest</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="destructive" size="sm" onClick={() => handleRemove(member.userId)}>
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        ))}

        {members.length === 0 && (
          <div className="text-muted-foreground p-4 text-center text-sm">
            No members in this project.
          </div>
        )}
      </div>

      {isCurrentUserAdmin ? (
        <div data-testid="add-member-form" className="flex items-end gap-3 rounded border p-3">
          <div className="flex-1">
            <Label htmlFor="new-user-id">User ID</Label>
            <Input
              id="new-user-id"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="Enter user ID"
              disabled={loading}
            />
          </div>
          <div className="w-[140px]">
            <Label htmlFor="new-role">Role</Label>
            <Select value={newRole} onValueChange={(value) => setNewRole(value as ProjectRole)}>
              <SelectTrigger id="new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ProjectRole.Admin}>Admin</SelectItem>
                <SelectItem value={ProjectRole.Member}>Member</SelectItem>
                <SelectItem value={ProjectRole.Guest}>Guest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={loading || !newUserId.trim()}>
            {loading ? 'Adding...' : 'Add Member'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
