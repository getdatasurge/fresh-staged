import DashboardLayout from '@/components/DashboardLayout';
import LogTempModal, { LogTempUnit } from '@/components/LogTempModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity';
import { computeUnitAlerts } from '@/hooks/useUnitAlerts';
import { UnitStatusInfo } from '@/hooks/useUnitStatus';
import { getAlertTypeConfig, getSeverityConfig } from '@/lib/alertConfig';
import { useTRPC } from '@/lib/trpc';
import { useUser } from '@stackframe/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpCircle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ClipboardEdit,
  Loader2,
  Mail,
  MailCheck,
  MailX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Unified alert type that works for both DB and computed alerts
interface UnifiedAlert {
  id: string;
  title: string;
  message: string | null;
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'acknowledged' | 'resolved';
  unit_id: string;
  unit_name: string;
  site_name: string;
  area_name: string;
  temp_reading: number | null;
  temp_limit: number | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledgment_notes: string | null;
  isComputed: boolean;
  dbAlertId?: string;
  escalation_level?: number;
  last_notified_at?: string | null;
  last_notified_reason?: string | null;
}

const Alerts = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useUser();
  const trpc = useTRPC();
  const { effectiveOrgId, isInitialized } = useEffectiveIdentity();

  // Queries
  const alertsQuery = useQuery(
    trpc.alerts.listByOrg.queryOptions(
      { organizationId: effectiveOrgId || '', limit: 100 },
      { enabled: !!effectiveOrgId },
    ),
  );

  const unitsQuery = useQuery(
    trpc.units.listByOrg.queryOptions(
      { organizationId: effectiveOrgId || '' },
      { enabled: !!effectiveOrgId },
    ),
  );

  // Mutations
  const acknowledgeMutation = useMutation(trpc.alerts.acknowledge.mutationOptions());
  const resolveMutation = useMutation(trpc.alerts.resolve.mutationOptions());

  const [isLoading, setIsLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<UnifiedAlert | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showAcknowledgeDialog, setShowAcknowledgeDialog] = useState(false);
  const [acknowledgmentNotes, setAcknowledgmentNotes] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('active');

  // Log temp modal state
  const [selectedUnit, setSelectedUnit] = useState<LogTempUnit | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (isInitialized && !alertsQuery.isLoading && !unitsQuery.isLoading) {
      setIsLoading(false);
    }
  }, [isInitialized, alertsQuery.isLoading, unitsQuery.isLoading]);

  // Merge logic
  const unifiedAlerts = useMemo(() => {
    if (!unitsQuery.data || !alertsQuery.data) return [];

    const formattedUnits: UnitStatusInfo[] = unitsQuery.data.map((u) => ({
      id: u.id,
      name: u.name,
      unit_type: u.unitType,
      status: u.status,
      last_temp_reading: u.lastTemperature,
      last_reading_at: u.lastReadingAt?.toISOString() || null,
      temp_limit_high: u.tempMax,
      temp_limit_low: u.tempMin,
      manual_log_cadence: u.manualMonitoringInterval || 240,
      last_manual_log_at: u.lastManualLogAt?.toISOString() || null,
      area: { name: u.areaName, site: { name: u.siteName } },
    }));

    const computedAlertsSummary = computeUnitAlerts(formattedUnits);
    const unified: UnifiedAlert[] = [];
    const seenAlerts = new Set<string>();

    // Add computed alerts
    for (const computed of computedAlertsSummary.alerts) {
      const key = `${computed.unit_id}-${computed.type}`;
      seenAlerts.add(key);
      unified.push({
        id: computed.id,
        title: computed.title,
        message: computed.message,
        alertType: computed.type,
        severity: computed.severity,
        status: 'active',
        unit_id: computed.unit_id,
        unit_name: computed.unit_name,
        site_name: computed.site_name,
        area_name: computed.area_name,
        temp_reading: null,
        temp_limit: null,
        triggered_at: computed.created_at,
        acknowledged_at: null,
        acknowledgment_notes: null,
        isComputed: true,
      });
    }

    // Add DB alerts
    for (const dbAlert of alertsQuery.data) {
      const computedKey = `${dbAlert.unitId}-${dbAlert.alertType.toUpperCase()}`;
      if (seenAlerts.has(computedKey) && dbAlert.status === 'active') continue;

      unified.push({
        id: dbAlert.id,
        title: dbAlert.message || 'Alert',
        message: dbAlert.message,
        alertType: dbAlert.alertType,
        severity: dbAlert.severity,
        status: dbAlert.status === 'escalated' ? 'active' : dbAlert.status,
        unit_id: dbAlert.unitId,
        unit_name: (dbAlert as any).unitName,
        site_name: (dbAlert as any).siteName,
        area_name: (dbAlert as any).areaName,
        temp_reading: dbAlert.triggerTemperature,
        temp_limit: dbAlert.thresholdViolated ? parseFloat(dbAlert.thresholdViolated) : null,
        triggered_at: dbAlert.triggeredAt.toISOString(),
        acknowledged_at: dbAlert.acknowledgedAt?.toISOString() || null,
        acknowledgment_notes: dbAlert.metadata ? JSON.parse(dbAlert.metadata).notes : null,
        isComputed: false,
        dbAlertId: dbAlert.id,
        escalation_level: dbAlert.escalationLevel,
        last_notified_at: dbAlert.escalatedAt?.toISOString() || null,
      });
    }

    unified.sort((a, b) => {
      if (a.status !== b.status) {
        const statusOrder = { active: 0, acknowledged: 1, resolved: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (a.severity !== b.severity) {
        const sevOrder = { critical: 0, warning: 1, info: 2 };
        return sevOrder[a.severity] - sevOrder[b.severity];
      }
      return new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime();
    });

    return unified;
  }, [unitsQuery.data, alertsQuery.data]);

  const handleRefetch = useCallback(() => {
    alertsQuery.refetch();
    unitsQuery.refetch();
  }, [alertsQuery, unitsQuery]);

  const handleAcknowledge = async () => {
    if (!selectedAlert || !acknowledgmentNotes.trim()) {
      toast({ title: 'Please provide acknowledgment notes', variant: 'destructive' });
      return;
    }

    if (selectedAlert.isComputed) {
      toast({
        title: 'Computed alerts cannot be acknowledged - resolve the underlying issue',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await acknowledgeMutation.mutateAsync({
        organizationId: effectiveOrgId || '',
        alertId: selectedAlert.dbAlertId || selectedAlert.id,
        notes: acknowledgmentNotes.trim(),
      });

      toast({ title: 'Alert acknowledged' });
      setShowAcknowledgeDialog(false);
      setSelectedAlert(null);
      setAcknowledgmentNotes('');
      handleRefetch();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast({ title: 'Failed to acknowledge', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const openAcknowledgeDialog = (alert: UnifiedAlert) => {
    setSelectedAlert(alert);
    setAcknowledgmentNotes('');
    setShowAcknowledgeDialog(true);
  };

  const handleResolve = async () => {
    if (!selectedAlert || !correctiveAction.trim()) {
      toast({ title: 'Please describe the corrective action', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await resolveMutation.mutateAsync({
        organizationId: effectiveOrgId || '',
        alertId: selectedAlert.dbAlertId || selectedAlert.id,
        resolution: rootCause || 'Issue resolved',
        correctiveAction: correctiveAction.trim(),
      });

      toast({ title: 'Alert resolved with corrective action' });
      setShowResolveDialog(false);
      setSelectedAlert(null);
      setCorrectiveAction('');
      setRootCause('');
      handleRefetch();
    } catch (error) {
      console.error('Error resolving alert:', error);
      toast({ title: 'Failed to resolve', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleLogTemp = (alert: UnifiedAlert) => {
    if (!unitsQuery.data) return;
    const u = unitsQuery.data.find((u) => u.id === alert.unit_id);
    if (!u) return;

    setSelectedUnit({
      id: u.id,
      name: u.name,
      unit_type: u.unitType,
      status: u.status,
      temp_limit_high: u.tempMax,
      temp_limit_low: u.tempMin,
      manual_log_cadence: u.manualMonitoringInterval || 240,
      area: { name: u.areaName, site: { name: u.siteName } },
    } as any);
    setModalOpen(true);
  };

  const handleLogSuccess = () => {
    handleRefetch();
  };

  const getTimeAgo = (dateStr: string) => {
    const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const filteredAlerts = unifiedAlerts.filter((a) => {
    if (activeTab === 'active') return a.status === 'active';
    if (activeTab === 'acknowledged') return a.status === 'acknowledged';
    if (activeTab === 'resolved') return a.status === 'resolved';
    return true;
  });

  const activeCount = unifiedAlerts.filter((a) => a.status === 'active').length;
  const acknowledgedCount = unifiedAlerts.filter((a) => a.status === 'acknowledged').length;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Alerts Center">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" className="relative">
            Active
            {activeCount > 0 && (
              <Badge className="ml-2 bg-alarm text-alarm-foreground">{activeCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="acknowledged">
            Acknowledged
            {acknowledgedCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {acknowledgedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-3">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => {
              const typeConfig = getAlertTypeConfig(alert.alertType);
              const severity = getSeverityConfig(alert.severity);
              const Icon = typeConfig?.icon || AlertTriangle;
              const showLogButton =
                alert.alertType === 'MANUAL_REQUIRED' || alert.alertType === 'missed_manual_entry';

              return (
                <Card
                  key={alert.id}
                  className={`${alert.status === 'active' ? 'border-alarm/30' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                      {/* Icon */}
                      <div
                        className={`w-10 h-10 rounded-lg ${severity.bgColor} flex items-center justify-center flex-shrink-0`}
                      >
                        <Icon className={`w-5 h-5 ${severity.color}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Title row */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground">{alert.title}</h3>
                              <Badge className={`${severity.bgColor} ${severity.color} border-0`}>
                                {alert.severity}
                              </Badge>
                              {alert.escalation_level && alert.escalation_level > 1 && (
                                <Badge variant="outline" className="text-warning border-warning">
                                  <ArrowUpCircle className="w-3 h-3 mr-1" />
                                  Level {alert.escalation_level}
                                </Badge>
                              )}
                              {alert.isComputed && (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Live
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {alert.site_name} · {alert.area_name} · {alert.unit_name}
                            </p>
                          </div>

                          <div className="text-left sm:text-right flex-shrink-0">
                            <p className="text-xs text-muted-foreground">
                              {getTimeAgo(alert.triggered_at)}
                            </p>
                            {alert.acknowledged_at && (
                              <p className="text-xs text-safe mt-1">
                                <Check className="w-3 h-3 inline mr-1" />
                                Ack'd {getTimeAgo(alert.acknowledged_at)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Message - fully wrapped, no truncation */}
                        {alert.message && (
                          <p
                            className="text-sm text-muted-foreground break-words leading-relaxed"
                            style={{ overflowWrap: 'anywhere' }}
                          >
                            {alert.message}
                          </p>
                        )}

                        {/* Temperature info */}
                        {alert.temp_reading !== null && (
                          <p className="text-sm">
                            <span className="text-alarm font-semibold">{alert.temp_reading}°F</span>
                            {alert.temp_limit && (
                              <span className="text-muted-foreground">
                                {' '}
                                (limit: {alert.temp_limit}°F)
                              </span>
                            )}
                          </p>
                        )}

                        {/* Email delivery status */}
                        {!alert.isComputed && (
                          <div className="flex items-center gap-1.5 text-xs">
                            {alert.last_notified_at ? (
                              <>
                                <MailCheck className="w-3.5 h-3.5 text-safe" />
                                <span className="text-safe">
                                  Email sent {getTimeAgo(alert.last_notified_at)}
                                </span>
                              </>
                            ) : alert.last_notified_reason ? (
                              <>
                                <MailX className="w-3.5 h-3.5 text-warning" />
                                <span className="text-warning">
                                  Email: {alert.last_notified_reason}
                                </span>
                              </>
                            ) : (
                              <>
                                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">Email pending</span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Action Buttons */}
                        {alert.status === 'active' && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {showLogButton && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-warning/50 text-warning hover:bg-warning/10"
                                onClick={() => handleLogTemp(alert)}
                              >
                                <ClipboardEdit className="w-4 h-4 mr-1" />
                                Log Temp
                              </Button>
                            )}
                            {!alert.isComputed && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openAcknowledgeDialog(alert)}
                                disabled={isSubmitting}
                              >
                                <Bell className="w-4 h-4 mr-1" />
                                Acknowledge
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="bg-safe hover:bg-safe/90 text-safe-foreground"
                              onClick={() => {
                                setSelectedAlert(alert);
                                setShowResolveDialog(true);
                              }}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Resolve
                            </Button>
                          </div>
                        )}

                        {/* Acknowledged state */}
                        {alert.status === 'acknowledged' && (
                          <div className="space-y-2 pt-1">
                            {alert.acknowledgment_notes && (
                              <div
                                className="p-2 rounded bg-muted/50 text-sm break-words"
                                style={{ overflowWrap: 'anywhere' }}
                              >
                                <span className="text-muted-foreground">Notes: </span>
                                {alert.acknowledgment_notes}
                              </div>
                            )}
                            <Button
                              size="sm"
                              className="bg-safe hover:bg-safe/90 text-safe-foreground"
                              onClick={() => {
                                setSelectedAlert(alert);
                                setShowResolveDialog(true);
                              }}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Resolve with Action
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-safe/10 flex items-center justify-center mb-4">
                  {activeTab === 'active' ? (
                    <CheckCircle2 className="w-7 h-7 text-safe" />
                  ) : activeTab === 'acknowledged' ? (
                    <Bell className="w-7 h-7 text-muted-foreground" />
                  ) : (
                    <BellOff className="w-7 h-7 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {activeTab === 'active'
                    ? 'All Clear!'
                    : activeTab === 'acknowledged'
                      ? 'No Acknowledged Alerts'
                      : 'No Resolved Alerts'}
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  {activeTab === 'active'
                    ? 'No active alerts at this time. All systems are operating normally.'
                    : activeTab === 'acknowledged'
                      ? 'No alerts pending resolution.'
                      : 'Resolved alerts will appear here.'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-safe" />
              Resolve Alert
            </DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold text-foreground">{selectedAlert.title}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAlert.site_name} · {selectedAlert.unit_name}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="action">Corrective Action Taken *</Label>
                <Textarea
                  id="action"
                  placeholder="Describe what was done to resolve this issue..."
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cause">Root Cause (optional)</Label>
                <Textarea
                  id="cause"
                  placeholder="What caused this issue?"
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowResolveDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-safe hover:bg-safe/90"
                  onClick={handleResolve}
                  disabled={isSubmitting || !correctiveAction.trim()}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Resolve Alert
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Acknowledge Dialog */}
      <Dialog open={showAcknowledgeDialog} onOpenChange={setShowAcknowledgeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-accent" />
              Acknowledge Alert
            </DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold text-foreground">{selectedAlert.title}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAlert.site_name} · {selectedAlert.unit_name}
                </p>
                {selectedAlert.temp_reading !== null && (
                  <p className="text-sm mt-1">
                    <span className="text-alarm font-semibold">{selectedAlert.temp_reading}°F</span>
                    {selectedAlert.temp_limit && (
                      <span className="text-muted-foreground">
                        {' '}
                        (limit: {selectedAlert.temp_limit}°F)
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ack-notes">Acknowledgment Notes *</Label>
                <Textarea
                  id="ack-notes"
                  placeholder="Describe your acknowledgment (e.g., 'Investigating now', 'Aware of issue, monitoring closely')..."
                  value={acknowledgmentNotes}
                  onChange={(e) => setAcknowledgmentNotes(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Notes are required and will be included in compliance reports.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowAcknowledgeDialog(false);
                    setSelectedAlert(null);
                    setAcknowledgmentNotes('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAcknowledge}
                  disabled={isSubmitting || !acknowledgmentNotes.trim()}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Acknowledge
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log Temp Modal */}
      <LogTempModal
        unit={selectedUnit}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleLogSuccess}
      />
    </DashboardLayout>
  );
};

export default Alerts;
