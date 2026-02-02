import type { InsertEntityDashboardLayout } from './src/db/schema/telemetry.js';

// Let's try to create an example object
const example: InsertEntityDashboardLayout = {
  organizationId: '123e4567-e89b-12d3-a456-426614174000',
  entityType: 'unit',
  entityId: '123e4567-e89b-12d3-a456-426614174001',
  userId: '123e4567-e89b-12d3-a456-426614174002',
  slotNumber: 1,
  name: 'Test Layout',
  isUserDefault: false,
  layoutJson: {},
  widgetPrefsJson: {},
  timelineStateJson: {},
  layoutVersion: 1,
};

console.log('Example object:', example);
