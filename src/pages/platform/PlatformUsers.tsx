import { ConfirmSpoofingModal } from '@/components/platform/ConfirmSpoofingModal';
import PlatformLayout from '@/components/platform/PlatformLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';
import { ImpersonationTarget, useImpersonateAndNavigate } from '@/hooks/useImpersonateAndNavigate';
import { useTRPC } from '@/lib/trpc';
import {
    Building2,
    ChevronRight,
    Eye,
    Loader2,
    RefreshCw,
    Search,
    Shield,
    User,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

export default function PlatformUsers() {
  const { logSuperAdminAction } = useSuperAdmin();
  const trpc = useTRPC();
  const { 
    requestImpersonation, 
    cancelRequest,
    confirmAndNavigate,
    pendingTarget,
    isNavigating, 
    canImpersonate 
  } = useImpersonateAndNavigate();

  const [searchQuery, setSearchQuery] = useState('');

  const usersQuery = trpc.admin.listUsers.useQuery(undefined, {
    onSuccess: () => {
      logSuperAdminAction('VIEWED_USERS_LIST');
    }
  });

  const users = usersQuery.data || [];
  const isLoading = usersQuery.isLoading;

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(user =>
      user.email.toLowerCase().includes(query) ||
      (user.fullName && user.fullName.toLowerCase().includes(query)) ||
      (user.organizationName && user.organizationName.toLowerCase().includes(query))
    );
  }, [users, searchQuery]);

  const handleViewAsUser = (user: any) => {
    if (!user.organizationId || !user.organizationName) return;

    requestImpersonation({
      user_id: user.userId,
      email: user.email,
      full_name: user.fullName,
      organization_id: user.organizationId,
      organization_name: user.organizationName,
    });
  };

  const handleConfirmImpersonation = async (target: ImpersonationTarget, reason?: string): Promise<boolean> => {
    return confirmAndNavigate(target, reason);
  };

  const superAdminCount = users.filter(u => u.isSuperAdmin).length;
  const noOrgCount = users.filter(u => !u.organizationId).length;

  // Check if modal should be open
  const isModalOpen = pendingTarget !== null;

  return (
    <>
      <ConfirmSpoofingModal
        target={pendingTarget}
        isOpen={isModalOpen}
        onClose={cancelRequest}
        onConfirm={handleConfirmImpersonation}
        isLoading={isNavigating}
      />

      <PlatformLayout title="Users">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Super Admins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{superAdminCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              No Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {noOrgCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name, email, or organization..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => usersQuery.refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'No users match your search' : 'No users found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">
                          {user.fullName || 'No name'}
                        </span>
                        {user.isSuperAdmin && (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ml-1 border-purple-300 text-purple-700">
                            <Shield className="w-3 h-3 mr-1" />
                            Super Admin
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.organizationName ? (
                        <Link
                          to={`/platform/organizations/${user.organizationId}`}
                          className="flex items-center gap-1 text-sm hover:underline"
                        >
                          <Building2 className="w-3 h-3" />
                          {user.organizationName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">No organization</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.role ? (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          user.role === 'owner' 
                            ? 'border-transparent bg-primary text-primary-foreground' 
                            : 'border-transparent bg-secondary text-secondary-foreground'
                        }`}>
                          {user.role}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link to={`/platform/users/${user.userId}`}>
                          <Button variant="ghost" size="icon">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </Link>
                        {canImpersonate && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleViewAsUser(user)}
                                    disabled={!user.organizationId || isNavigating}
                                    className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                                  >
                                    {isNavigating ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Eye className="w-4 h-4" />
                                    )}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {user.organizationId 
                                  ? 'View app as this user' 
                                  : 'No organization membership'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </PlatformLayout>
    </>
  );
}

