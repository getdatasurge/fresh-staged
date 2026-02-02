import { AlertTriangle, Loader2, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AccountDeletionModal } from '@/components/settings/AccountDeletionModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { ComplianceMode } from '@/lib/api-types';
import { timezones } from '@/lib/settings-constants';
import { useTRPCClient } from '@/lib/trpc';

interface OrganizationTabProps {
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    complianceMode: string;
  } | null;
  canEditOrg: boolean;
  isLoading: boolean;
  stackUserId: string | undefined;
  userEmail: string;
  isOwner: boolean;
  hasOtherUsers: boolean;
  sensorCount: number;
  gatewayCount: number;
  onSaved: () => void;
}

export function OrganizationTab({
  organization,
  canEditOrg,
  isLoading,
  stackUserId,
  userEmail,
  isOwner,
  hasOtherUsers,
  sensorCount,
  gatewayCount,
  onSaved,
}: OrganizationTabProps) {
  const trpcClient = useTRPCClient();
  const [isSaving, setIsSaving] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('');
  const [orgCompliance, setOrgCompliance] = useState<ComplianceMode>('standard');

  useEffect(() => {
    if (organization) {
      setOrgName(organization.name);
      setOrgTimezone(organization.timezone);
      setOrgCompliance(organization.complianceMode as ComplianceMode);
    }
  }, [organization]);

  const saveOrganization = async () => {
    if (!organization) return;
    setIsSaving(true);
    try {
      await trpcClient.organizations.update.mutate({
        organizationId: organization.id,
        data: {
          name: orgName,
          timezone: orgTimezone,
          complianceMode: orgCompliance,
        },
      });
      toast.success('Organization updated');
      onSaved();
    } catch (error) {
      console.error('Error saving organization:', error);
      toast.error('Failed to save organization');
    }
    setIsSaving(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Organization Profile</CardTitle>
          <CardDescription>
            Manage your organization's settings and compliance preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!canEditOrg}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgSlug">URL Slug</Label>
              <Input id="orgSlug" value={organization?.slug || ''} disabled className="bg-muted" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={orgTimezone} onValueChange={setOrgTimezone} disabled={!canEditOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="compliance">Compliance Mode</Label>
              <Select
                value={orgCompliance}
                onValueChange={(v) => setOrgCompliance(v as ComplianceMode)}
                disabled={!canEditOrg}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="haccp">HACCP</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                HACCP mode enables stricter logging and audit requirements.
              </p>
            </div>
          </div>

          {canEditOrg && (
            <div className="flex justify-end pt-4">
              <Button onClick={saveOrganization} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-8" />

      <Card id="danger-zone" className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions that affect your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data
              </p>
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setDeleteAccountOpen(true)}
                disabled={!stackUserId || !userEmail}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AccountDeletionModal
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        userId={stackUserId || ''}
        userEmail={userEmail}
        isOwner={isOwner}
        hasOtherUsers={hasOtherUsers}
        sensorCount={sensorCount}
        gatewayCount={gatewayCount}
      />
    </>
  );
}
