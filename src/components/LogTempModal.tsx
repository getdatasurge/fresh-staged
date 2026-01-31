import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Thermometer, Loader2, WifiOff, Clock, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { temperatureSchema, notesSchema, validateInput } from '@/lib/validation';
import { useUser } from '@stackframe/react';

export interface LogTempUnit {
  id: string;
  name: string;
  unit_type: string;
  status: string;
  temp_limit_high: number;
  temp_limit_low: number | null;
  manual_log_cadence: number;
  area: { name: string; site: { name: string } };
}

interface LogTempModalProps {
  unit: LogTempUnit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const formatCadence = (seconds: number) => {
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)} min`;
  if (hours === 1) return '1 hour';
  return `${hours} hours`;
};

const LogTempModal = ({ unit, open, onOpenChange, onSuccess }: LogTempModalProps) => {
  const user = useUser();
  const { isOnline, saveLogOffline } = useOfflineSync();
  const { effectiveOrgId: orgId } = useEffectiveIdentity();
  const trpc = useTRPC();
  const [temperature, setTemperature] = useState('');
  const [notes, setNotes] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // tRPC mutation for logging temperature
  const logTemperatureMutation = useMutation(trpc.readings.logManualTemperature.mutationOptions());

  // Reset form when unit changes
  useEffect(() => {
    if (unit) {
      setTemperature('');
      setNotes('');
      setCorrectiveAction('');
    }
  }, [unit?.id]);

  const handleSubmit = async () => {
    if (!unit) {
      toast.error('Please select a unit');
      return;
    }

    // Validate temperature
    const temp = parseFloat(temperature);
    const tempResult = validateInput(temperatureSchema, temp);
    if (!tempResult.success) {
      toast.error((tempResult as { success: false; error: string }).error);
      return;
    }

    // Validate notes
    const notesResult = validateInput(notesSchema, notes);
    if (!notesResult.success) {
      toast.error((notesResult as { success: false; error: string }).error);
      return;
    }

    // Check if out of range and require corrective action
    const validatedTemp = (tempResult as { success: true; data: number }).data;
    const isOutOfRange =
      validatedTemp > unit.temp_limit_high ||
      (unit.temp_limit_low !== null && validatedTemp < unit.temp_limit_low);

    if (isOutOfRange && !correctiveAction.trim()) {
      toast.error('Corrective action required', {
        description: 'Temperature is out of range. Please describe the corrective action taken.',
      });
      return;
    }

    setIsSubmitting(true);
    const validatedNotes =
      (notesResult as { success: true; data: string | undefined }).data?.trim() || null;

    const logEntry = {
      id: crypto.randomUUID(),
      unit_id: unit.id,
      temperature: validatedTemp,
      notes: validatedNotes,
      logged_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    try {
      if (isOnline && user?.id && orgId) {
        // Save via tRPC mutation
        await logTemperatureMutation.mutateAsync({
          organizationId: orgId,
          unitId: unit.id,
          temperature: validatedTemp,
          notes: validatedNotes,
          correctiveAction: isOutOfRange ? correctiveAction.trim() : null,
          isInRange: !isOutOfRange,
        });
        toast.success('Temperature logged successfully');
      } else {
        await saveLogOffline(logEntry);
        toast('Saved offline', { description: 'Will sync when back online' });
      }

      // Close modal and trigger callback
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error saving log:', error);

      // Fallback to offline storage on any error
      await saveLogOffline(logEntry);
      toast('Saved offline', { description: 'Will sync when back online' });
      onOpenChange(false);
      onSuccess?.();
    }

    setIsSubmitting(false);
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen && !isOnline) {
      // Prevent silent dismissal when offline - require confirmation
      const confirmed = window.confirm(
        'You are offline. Are you sure you want to close without logging? The unit may require a temperature log.',
      );
      if (!confirmed) return;
    }
    if (!newOpen) {
      setTemperature('');
      setNotes('');
      setCorrectiveAction('');
    }
    onOpenChange(newOpen);
  };

  const isOutOfRange =
    temperature &&
    unit &&
    (parseFloat(temperature) > unit.temp_limit_high ||
      (unit.temp_limit_low !== null && parseFloat(temperature) < unit.temp_limit_low));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-accent" />
            Log Temperature
          </DialogTitle>
        </DialogHeader>

        {unit && (
          <div className="space-y-4 pt-2">
            {/* Unit Info with Status */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-foreground">{unit.name}</p>
                {(unit.status === 'manual_required' ||
                  unit.status === 'monitoring_interrupted' ||
                  unit.status === 'offline') && (
                  <Badge variant="destructive" className="text-xs">
                    {unit.status === 'offline' ? 'Sensor Offline' : 'Manual Required'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {unit.area.site.name} · {unit.area.name}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="text-muted-foreground">
                  Limit: ≤{unit.temp_limit_high}°F
                  {unit.temp_limit_low !== null && ` / ≥${unit.temp_limit_low}°F`}
                </span>
                <span className="text-muted-foreground border-l border-border pl-4">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Log every {formatCadence(unit.manual_log_cadence)}
                </span>
              </div>
            </div>

            {/* Offline Warning */}
            {!isOnline && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                <WifiOff className="w-4 h-4 text-warning flex-shrink-0" />
                <p className="text-xs text-warning">
                  You are offline. Log will be saved locally and synced when connection is restored.
                </p>
              </div>
            )}

            <div>
              <label
                htmlFor="log-temperature"
                className="text-sm font-medium text-foreground mb-2 block"
              >
                Temperature (°F) *
              </label>
              <Input
                id="log-temperature"
                type="number"
                inputMode="decimal"
                placeholder="Enter temperature"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="text-2xl font-bold h-14 text-center"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional UX: modal opens for quick data entry
                autoFocus
              />
              {temperature && (
                <div className="mt-2 text-center">
                  {parseFloat(temperature) > unit.temp_limit_high ? (
                    <Badge variant="destructive">Above Limit!</Badge>
                  ) : unit.temp_limit_low !== null &&
                    parseFloat(temperature) < unit.temp_limit_low ? (
                    <Badge variant="destructive">Below Limit!</Badge>
                  ) : (
                    <Badge className="bg-safe/10 text-safe border-safe/20">In Range</Badge>
                  )}
                </div>
              )}
            </div>

            {/* Corrective Action - Required when out of range */}
            {isOutOfRange && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <label
                  htmlFor="log-corrective-action"
                  className="text-sm font-medium text-destructive mb-2 block"
                >
                  Corrective Action Required *
                </label>
                <Textarea
                  id="log-corrective-action"
                  placeholder="Describe the corrective action taken (e.g., 'Adjusted thermostat, discarded affected items, notified manager')"
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  rows={3}
                  className="border-destructive/30 focus:border-destructive"
                />
                <p className="text-xs text-destructive/80 mt-2">
                  Temperature is out of range. You must document the corrective action before
                  submitting.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="log-notes" className="text-sm font-medium text-foreground mb-2 block">
                Notes (optional)
              </label>
              <Textarea
                id="log-notes"
                placeholder="Any observations..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent hover:bg-accent/90"
                onClick={handleSubmit}
                disabled={isSubmitting || !temperature}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save Log
              </Button>
            </div>

            {!isOnline && (
              <p className="text-xs text-center text-muted-foreground">
                <WifiOff className="w-3 h-3 inline mr-1" />
                Offline - will sync when connected
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LogTempModal;
