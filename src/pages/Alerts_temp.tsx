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
