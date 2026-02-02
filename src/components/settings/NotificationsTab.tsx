import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Loader2,
  Mail,
  MessageSquare,
  Save,
  Smartphone,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NotificationSettingsCard } from '@/components/settings/NotificationSettingsCard';
import { OptInImageStatusCard } from '@/components/settings/OptInImageStatusCard';
import { SmsAlertHistory } from '@/components/settings/SmsAlertHistory';
import { TelnyxWebhookUrlsCard } from '@/components/settings/TelnyxWebhookUrlsCard';
import { TollFreeVerificationCard } from '@/components/settings/TollFreeVerificationCard';
import { WebhookStatusCard } from '@/components/settings/WebhookStatusCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatPhoneForInput, getTelnyxErrorMessage, isValidE164 } from '@/lib/settings-constants';
import { useTRPCClient } from '@/lib/trpc';

interface NotificationsTabProps {
  organization: { id: string } | null;
  profile: {
    email: string;
    phone: string | null;
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    fullName: string | null;
  } | null;
  canEditOrg: boolean;
  canManageUsers: boolean;
  onProfileSaved: () => void;
}

export function NotificationsTab({
  organization,
  profile,
  canEditOrg,
  canManageUsers,
  onProfileSaved,
}: NotificationsTabProps) {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  const [isSaving, setIsSaving] = useState(false);
  const [notifPush, setNotifPush] = useState(true);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSms, setNotifSms] = useState(false);
  const [userPhone, setUserPhone] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsVerified, setSmsVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (profile) {
      setUserPhone(profile.phone || '');
      setNotifPush(profile.pushEnabled ?? true);
      setNotifEmail(profile.emailEnabled ?? true);
      setNotifSms(profile.smsEnabled ?? false);
    }
  }, [profile]);

  const saveNotifications = async () => {
    if (!profile) return;

    if (notifSms && userPhone) {
      if (!isValidE164(userPhone)) {
        toast.error('Invalid phone number format. Please use E.164 format (e.g., +15551234567)');
        return;
      }
    }

    setIsSaving(true);
    try {
      await trpcClient.users.updateProfile.mutate({
        fullName: profile.fullName || undefined,
        phone: userPhone || null,
        notificationPreferences: {
          push: notifPush,
          email: notifEmail,
          sms: notifSms,
        },
      });
      toast.success('Notification preferences saved');
      onProfileSaved();
    } catch (error) {
      console.error('Error saving notifications:', error);
      toast.error('Failed to save preferences');
    }
    setIsSaving(false);
  };

  const sendTestSms = async () => {
    if (!profile || !userPhone || !organization) return;

    if (!isValidE164(userPhone)) {
      toast.error('Invalid phone number. Please save a valid E.164 format number first.');
      return;
    }

    setIsSendingSms(true);
    try {
      toast.loading('Sending test SMS...', { id: 'test-sms' });

      const result = await trpcClient.notificationPolicies.sendTestSms.mutate({
        to: userPhone,
        message:
          '\u2705 FreshTrack Test: Your SMS alerts are configured correctly! You will receive critical alerts at this number.',
      });

      if (result?.status === 'sent') {
        if (result.warning) {
          toast.warning(`SMS sent with warning: ${result.warning}`, {
            id: 'test-sms',
            duration: 8000,
          });
        } else {
          toast.success(
            `Test SMS sent! (ID: ${result.provider_message_id?.slice(-8) || 'confirmed'})`,
            { id: 'test-sms' },
          );
        }
        setSmsVerified(true);
        queryClient.invalidateQueries({
          queryKey: ['sms-alert-history', organization.id],
        });
      } else if (result?.status === 'rate_limited') {
        toast.info('SMS rate limited. Please wait 15 minutes before trying again.', {
          id: 'test-sms',
        });
      } else {
        const friendlyError = getTelnyxErrorMessage(result?.error || 'Unknown error');
        toast.error(friendlyError, { id: 'test-sms', duration: 8000 });
        setSmsVerified(false);
      }
    } catch (error) {
      console.error('Error sending test SMS:', error);
      const message = error instanceof Error ? error.message : 'Failed to send test SMS';
      toast.error(getTelnyxErrorMessage(message), { id: 'test-sms' });
      setSmsVerified(false);
    } finally {
      setIsSendingSms(false);
    }
  };

  return (
    <div className="space-y-6">
      {organization && (
        <NotificationSettingsCard organizationId={organization.id} canEdit={canEditOrg} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Personal Notification Preferences</CardTitle>
          <CardDescription>
            Choose how you want to receive alerts and updates for your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Push Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts in your browser or mobile app
                  </p>
                </div>
              </div>
              <Switch checked={notifPush} onCheckedChange={setNotifPush} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Get alerts sent to {profile?.email}
                  </p>
                </div>
              </div>
              <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-safe/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-safe" />
                </div>
                <div>
                  <p className="font-medium">SMS Notifications</p>
                  <p className="text-sm text-muted-foreground">Critical alerts via text message</p>
                </div>
              </div>
              <Switch checked={notifSms} onCheckedChange={setNotifSms} />
            </div>
          </div>

          {notifSms && (
            <div className="space-y-3 pt-2">
              <Label htmlFor="phone">Phone Number (E.164 Format)</Label>
              <div className="flex gap-2 items-start">
                <Smartphone className="w-5 h-5 text-muted-foreground mt-2.5" />
                <div className="flex-1 max-w-xs space-y-1">
                  <div className="relative">
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+15551234567"
                      value={userPhone}
                      onChange={(e) => {
                        setUserPhone(formatPhoneForInput(e.target.value));
                        setSmsVerified(null);
                      }}
                      className={`${userPhone && !isValidE164(userPhone) ? 'border-destructive' : ''} ${smsVerified === true ? 'border-safe pr-8' : ''}`}
                    />
                    {smsVerified === true && (
                      <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-safe" />
                    )}
                  </div>
                  {userPhone && !isValidE164(userPhone) && (
                    <p className="text-xs text-destructive">
                      Please enter a valid E.164 format (e.g., +15551234567)
                    </p>
                  )}
                  {smsVerified === true && (
                    <p className="text-xs text-safe flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      SMS verified - alerts will be sent to this number
                    </p>
                  )}
                  {smsVerified === false && (
                    <p className="text-xs text-warning flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      SMS verification failed. Check the error message and try again.
                    </p>
                  )}
                </div>
                {canManageUsers && userPhone && isValidE164(userPhone) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={sendTestSms}
                    disabled={isSendingSms}
                    className="shrink-0"
                  >
                    {isSendingSms ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Test SMS'
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Required for SMS alerts. Use international format starting with + and country code.
                Standard messaging rates may apply.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={saveNotifications} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {canManageUsers && organization && (
        <div className="mt-6 space-y-6">
          <TollFreeVerificationCard />
          <OptInImageStatusCard />
          <TelnyxWebhookUrlsCard />
          <WebhookStatusCard organizationId={organization.id} canEdit={canEditOrg} />
          <SmsAlertHistory organizationId={organization.id} />
        </div>
      )}
    </div>
  );
}
