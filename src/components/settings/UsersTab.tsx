import { Crown, Eye, Shield, Trash2, User, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AppRole } from '@/lib/api-types';
import { roleConfig } from '@/lib/settings-constants';
import { useTRPCClient } from '@/lib/trpc';

interface UserWithRole {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
}

interface UsersTabProps {
  organizationId: string;
  users: UserWithRole[];
  currentUserId: string | undefined;
  canManageUsers: boolean;
  onMembersChanged: () => void;
}

export function UsersTab({
  organizationId,
  users,
  currentUserId,
  canManageUsers,
  onMembersChanged,
}: UsersTabProps) {
  const trpcClient = useTRPCClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('staff');
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    currentRole: AppRole;
    newRole: AppRole;
  } | null>(null);
  const [removeUserConfirm, setRemoveUserConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    role: AppRole;
  } | null>(null);

  const ownerCount = users.filter((u) => u.role === 'owner').length;

  const requestRoleChange = (userId: string, newRole: AppRole) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    if (user.role === 'owner' && newRole !== 'owner' && ownerCount <= 1) {
      toast.error(
        'Cannot demote the last owner. Transfer ownership first or promote another user to owner.',
      );
      return;
    }

    setRoleChangeConfirm({
      open: true,
      userId,
      userName: user.full_name || user.email || 'this user',
      currentRole: user.role,
      newRole,
    });
  };

  const confirmRoleChange = async () => {
    if (!roleChangeConfirm) return;

    const { userId, newRole } = roleChangeConfirm;

    try {
      await trpcClient.organizations.updateMemberRole.mutate({
        organizationId,
        userId,
        role: newRole,
      });
      onMembersChanged();
      toast.success('Role updated successfully');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    } finally {
      setRoleChangeConfirm(null);
    }
  };

  const requestRemoveUser = (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    if (user.role === 'owner' && ownerCount <= 1) {
      toast.error('Cannot remove the last owner. Transfer ownership first.');
      return;
    }

    setRemoveUserConfirm({
      open: true,
      userId,
      userName: user.full_name || user.email || 'this user',
      role: user.role,
    });
  };

  const confirmRemoveUser = async () => {
    if (!removeUserConfirm) return;

    const { userId } = removeUserConfirm;
    setRemoveUserConfirm(null);

    try {
      toast.loading("Cleaning up user's sensors...", { id: 'remove-user' });

      await trpcClient.organizations.removeMember.mutate({
        organizationId,
        userId,
      });

      onMembersChanged();
      toast.success('User removed from organization', { id: 'remove-user' });
    } catch (error) {
      console.error('Error removing user:', error);
      toast.error('Failed to remove user', { id: 'remove-user' });
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;

    toast.info(`Invite functionality coming soon. Would invite ${inviteEmail} as ${inviteRole}`);
    setInviteOpen(false);
    setInviteEmail('');
    setInviteRole('staff');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage users and their roles in your organization.</CardDescription>
            </div>
            {canManageUsers && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Team Member</DialogTitle>
                    <DialogDescription>
                      Send an invitation to join your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="inviteEmail">Email Address</Label>
                      <Input
                        id="inviteEmail"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inviteRole">Role</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInviteOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleInvite}>Send Invitation</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  {canManageUsers && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const role = roleConfig[user.role];
                  const RoleIcon = role.icon;
                  const isCurrentUser = user.user_id === currentUserId;
                  const isOwner = user.role === 'owner';

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-accent" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {user.full_name || 'Unnamed User'}
                              {isCurrentUser && (
                                <span className="text-xs text-muted-foreground ml-2">(You)</span>
                              )}
                            </p>
                            {canManageUsers || isCurrentUser ? (
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                Contact info hidden
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canManageUsers && !isOwner && !isCurrentUser ? (
                          <Select
                            value={user.role}
                            onValueChange={(v) => requestRoleChange(user.user_id, v as AppRole)}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="inspector">Inspector</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${role.color}`}
                          >
                            <RoleIcon className="w-3 h-3 mr-1" />
                            {role.label}
                          </span>
                        )}
                      </TableCell>
                      {canManageUsers && (
                        <TableCell>
                          {!isOwner && !isCurrentUser && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => requestRemoveUser(user.user_id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-dashed">
            <h4 className="font-medium mb-2">Role Permissions</h4>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-warning" />
                <span>
                  <strong>Owner:</strong> Full access, billing, can transfer ownership
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                <span>
                  <strong>Admin:</strong> Manage users, sites, devices, and settings
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span>
                  <strong>Manager:</strong> Manage sites and respond to alerts
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-safe" />
                <span>
                  <strong>Staff:</strong> Log temperatures and acknowledge alerts
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span>
                  <strong>Viewer:</strong> View-only access to dashboard and reports
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Change Confirmation Dialog */}
      <Dialog
        open={roleChangeConfirm?.open ?? false}
        onOpenChange={(open) => !open && setRoleChangeConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Role Change</DialogTitle>
            <DialogDescription>
              You are about to change the role for <strong>{roleChangeConfirm?.userName}</strong>{' '}
              from{' '}
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold mx-1">
                {roleConfig[roleChangeConfirm?.currentRole ?? 'staff']?.label}
              </span>
              to{' '}
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold mx-1 text-primary border-primary/30 bg-primary/5">
                {roleConfig[roleChangeConfirm?.newRole ?? 'staff']?.label}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will immediately affect what actions this user can perform in the organization.
            </p>
            {roleChangeConfirm?.newRole === 'admin' && (
              <p className="text-sm text-warning mt-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Admins have elevated privileges and can manage users and settings.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChangeConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={confirmRoleChange}>Confirm Change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove User Confirmation Dialog */}
      <Dialog
        open={removeUserConfirm?.open ?? false}
        onOpenChange={(open) => !open && setRemoveUserConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remove Team Member
            </DialogTitle>
            <DialogDescription>
              You are about to remove <strong>{removeUserConfirm?.userName}</strong> from this
              organization.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              This will revoke their access to all organization data and resources. Any sensors they
              created will also be cleaned up.
            </p>
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
              <p className="text-sm font-medium text-destructive">This action cannot be undone.</p>
              <p className="text-xs text-muted-foreground mt-1">
                The user will need to be re-invited to regain access.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveUserConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemoveUser}>
              Remove User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
