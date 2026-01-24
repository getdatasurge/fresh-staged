// API types matching backend Zod schemas - keep in sync with backend/src/schemas/
// These types are manually defined to match backend schema structure

// ===== Common Types =====

export type UUID = string;

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Error types (discriminated union)
export type ApiError =
  | { type: 'network'; message: string }
  | { type: 'validation'; field?: string; message: string; details?: ErrorDetail[] }
  | { type: 'auth'; code: 401 | 403; message: string }
  | { type: 'server'; status: number; message: string };

export interface ErrorDetail {
  path: (string | number)[];
  message: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
}

// ===== Organization Types =====

export type ComplianceMode = 'standard' | 'haccp';
export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

export interface OrganizationResponse {
  id: UUID;
  name: string;
  slug: string;
  timezone: string;
  complianceMode: ComplianceMode;
  sensorLimit: number;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateOrganizationRequest {
  name?: string;
  timezone?: string;
  complianceMode?: ComplianceMode;
  logoUrl?: string | null;
}

export interface MemberResponse {
  userId: UUID;
  email: string;
  fullName: string | null;
  role: AppRole;
  joinedAt: Date;
}

// ===== Site Types =====

export interface SiteResponse {
  id: UUID;
  organizationId: UUID;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
  latitude: string | null;
  longitude: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSiteRequest {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  timezone?: string;
  latitude?: string | null;
  longitude?: string | null;
}

export interface UpdateSiteRequest {
  name?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  timezone?: string;
  latitude?: string | null;
  longitude?: string | null;
}

// ===== Area Types =====

export interface AreaResponse {
  id: UUID;
  siteId: UUID;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAreaRequest {
  name: string;
  description?: string | null;
  sortOrder?: number;
}

export interface UpdateAreaRequest {
  name?: string;
  description?: string | null;
  sortOrder?: number;
}

// ===== Unit Types =====

export type UnitType =
  | 'fridge'
  | 'freezer'
  | 'display_case'
  | 'walk_in_cooler'
  | 'walk_in_freezer'
  | 'blast_chiller';

export type UnitStatus =
  | 'ok'
  | 'excursion'
  | 'alarm_active'
  | 'monitoring_interrupted'
  | 'manual_required'
  | 'restoring'
  | 'offline';

export type TempUnit = 'F' | 'C';

export interface UnitResponse {
  id: UUID;
  areaId: UUID;
  name: string;
  unitType: UnitType;
  status: UnitStatus;
  tempMin: number;
  tempMax: number;
  tempUnit: TempUnit;
  manualMonitoringRequired: boolean;
  manualMonitoringInterval: number | null;
  lastReadingAt: Date | null;
  lastTemperature: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUnitRequest {
  name: string;
  unitType: UnitType;
  status?: UnitStatus;
  tempMin: number;
  tempMax: number;
  tempUnit?: TempUnit;
  manualMonitoringRequired?: boolean;
  manualMonitoringInterval?: number | null;
  sortOrder?: number;
}

export interface UpdateUnitRequest {
  name?: string;
  unitType?: UnitType;
  status?: UnitStatus;
  tempMin?: number;
  tempMax?: number;
  tempUnit?: TempUnit;
  manualMonitoringRequired?: boolean;
  manualMonitoringInterval?: number | null;
  sortOrder?: number;
}

// ===== Reading Types =====

export type ReadingSource = 'ttn' | 'manual' | 'api' | 'import';

export interface ReadingResponse {
  id: UUID;
  unitId: UUID;
  deviceId: UUID | null;
  temperature: number;
  humidity: number | null;
  battery: number | null;
  signalStrength: number | null;
  rawPayload: string | null;
  recordedAt: Date;
  receivedAt: Date;
  source: string | null;
}

export interface SingleReading {
  unitId: UUID;
  deviceId?: UUID;
  temperature: number;
  humidity?: number;
  battery?: number;
  signalStrength?: number;
  recordedAt: string; // ISO 8601
  source?: ReadingSource;
  rawPayload?: string;
}

export interface BulkReadingsRequest {
  readings: SingleReading[];
}

export interface ReadingsListResponse {
  data: ReadingResponse[];
  pagination?: PaginationMeta;
}

// ===== Alert Types =====

export type AlertType =
  | 'alarm_active'
  | 'monitoring_interrupted'
  | 'missed_manual_entry'
  | 'low_battery'
  | 'sensor_fault'
  | 'door_open'
  | 'calibration_due';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'escalated';

export interface AlertResponse {
  id: UUID;
  unitId: UUID;
  alertRuleId: UUID | null;
  alertType: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string | null;
  triggerTemperature: number | null;
  thresholdViolated: string | null;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: UUID | null;
  resolvedAt: Date | null;
  resolvedBy: UUID | null;
  escalatedAt: Date | null;
  escalationLevel: number;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertsListResponse {
  data: AlertResponse[];
  pagination?: PaginationMeta;
}

export interface AlertAcknowledgeRequest {
  notes?: string;
}

export interface AlertResolveRequest {
  resolution: string;
  correctiveAction?: string;
}
