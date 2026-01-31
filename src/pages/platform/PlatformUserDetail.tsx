import { ConfirmSpoofingModal } from '@/components/platform/ConfirmSpoofingModal';
import PlatformLayout from '@/components/platform/PlatformLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';
import { ImpersonationTarget, useImpersonateAndNavigate } from '@/hooks/useImpersonateAndNavigate';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  Activity,
  Building2,
  Calendar,
  ExternalLink,
  Eye,
  Mail,
  Phone,
  Shield,
  User,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

export default function PlatformUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const { logSuperAdminAction } = useSuperAdmin();
  const trpc = useTRPC();
  const {
    requestImpersonation,
    cancelRequest,
    confirmAndNavigate,
    pendingTarget,
    isNavigating,
    canImpersonate,
  } = useImpersonateAndNavigate();

  const userQuery = useQuery(
    (trpc.admin as any).getUser.queryOptions({ userId: userId || '' }, { enabled: !!userId }),
  );

  const hasLoggedUserRef = useRef(false);

  // Handle side effect for logging
  useEffect(() => {
    if (userQuery.data && !hasLoggedUserRef.current) {
      hasLoggedUserRef.current = true;
      const userData = userQuery.data as any;
      logSuperAdminAction(
        'VIEWED_USER_DETAIL',
        'user',
        userData.userId,
        userData.organizationId || undefined,
        { user_email: userData.email },
      );
    }
  }, [userQuery.data, logSuperAdminAction]);

  const user = userQuery.data as any;
  const isLoading = userQuery.isLoading;

  const handleViewAsUser = () => {
    if (!user) return;

    // Find a valid organization to impersonate if multiple roles exist
    const primaryRole = user.roles?.[0];
    if (!primaryRole) return;

    requestImpersonation({
      user_id: user.userId,
      email: user.email,
      full_name: user.fullName,
      organization_id: primaryRole.organizationId,
      organization_name: primaryRole.organizationName,
    });
  };

  const handleConfirmImpersonation = async (
    target: ImpersonationTarget,
    reason?: string,
  ): Promise<boolean> => {
    return confirmAndNavigate(target, reason);
  };

  const isModalOpen = pendingTarget !== null;

  if (isLoading || !user) {
    return (
      <>
        <ConfirmSpoofingModal
          target={pendingTarget}
          isOpen={isModalOpen}
          onClose={cancelRequest}
          onConfirm={handleConfirmImpersonation}
          isLoading={isNavigating}
        />
        <PlatformLayout title="User Details" showBack backHref="/platform/users">
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading user details...</div>
          </div>
        </PlatformLayout>
      </>
    );
  }

  return (
    <>
      <ConfirmSpoofingModal
        target={pendingTarget}
        isOpen={isModalOpen}
        onClose={cancelRequest}
        onConfirm={handleConfirmImpersonation}
        isLoading={isNavigating}
      />
      <PlatformLayout title={user.fullName || user.email} showBack backHref="/platform/users">
        {/* User Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                User Information
                {user.isSuperAdmin && (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ml-auto border-purple-300 text-purple-700">
                    <Shield className="w-3 h-3 mr-1" />
                    Super Admin
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div>{user.email}</div>
                </div>
              </div>

              {user.fullName && (
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Full Name</div>
                    <div>{user.fullName}</div>
                  </div>
                </div>
              )}

              {user.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Phone</div>
                    <div>{user.phone}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Joined</div>
                  <div>{new Date(user.createdAt).toLocaleDateString()}</div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground font-mono mt-4 pt-4 border-t">
                User ID: {user.userId}
              </div>
            </CardContent>
          </Card>

          {/* Organizations Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Organization Memberships
              </CardTitle>
            </CardHeader>
            <CardContent>
              {user.roles && user.roles.length > 0 ? (
                <div className="space-y-4">
                  {user.roles.map((role: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <Link
                          to={`/platform/organizations/${role.organizationId}`}
                          className="flex items-center gap-2 font-medium hover:underline"
                        >
                          {role.organizationName}
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        <div className="text-sm text-muted-foreground">{role.role}</div>
                      </div>
                      {canImpersonate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            requestImpersonation({
                              user_id: user.userId,
                              email: user.email,
                              full_name: user.fullName,
                              organization_id: role.organizationId,
                              organization_name: role.organizationName,
                            });
                          }}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View As
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  This user is not a member of any organization.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Note: Recent activity would need audit log queries which we can add later */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Platform Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground text-sm">
              This user has {user.roles?.length || 0} organization memberships. Last updated:{' '}
              {new Date(user.updatedAt).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </PlatformLayout>
    </>
  );
}
