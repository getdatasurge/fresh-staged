/**
 * Temporary seed script to create test organization
 *
 * Run with: cd backend && npx tsx scripts/seed-test-org.ts
 */

// Load environment variables FIRST, before any other imports
import 'dotenv/config';

import { db } from '../src/db/client.js';
import { organizations, profiles, userRoles, sites, areas, units } from '../src/db/schema/index.js';

async function seed() {
  console.log('Creating test organization...');

  const orgId = 'a0000000-0000-0000-0000-000000000001';
  const userId = '2a722994-f59a-43eb-81f7-33ca260bbb87';
  const profileId = 'b0000000-0000-0000-0000-000000000001';
  const siteId = 'c0000000-0000-0000-0000-000000000001';
  const areaId = 'd0000000-0000-0000-0000-000000000001';
  const unitId = 'e0000000-0000-0000-0000-000000000001';

  try {
    // Create organization
    await db.insert(organizations).values({
      id: orgId,
      name: 'Test Organization',
      slug: 'test-org',
      timezone: 'America/New_York',
    }).onConflictDoNothing();
    console.log('✓ Organization created');

    // Create profile
    await db.insert(profiles).values({
      id: profileId,
      userId: userId,
      organizationId: orgId,
      email: 'bialek.christopher@gmail.com',
      fullName: 'Christopher Bialek',
    }).onConflictDoNothing();
    console.log('✓ Profile created');

    // Create user role
    await db.insert(userRoles).values({
      userId: userId,
      organizationId: orgId,
      role: 'owner',
    }).onConflictDoNothing();
    console.log('✓ User role created');

    // Create site
    await db.insert(sites).values({
      id: siteId,
      organizationId: orgId,
      name: 'Test Site',
      isActive: true,
    }).onConflictDoNothing();
    console.log('✓ Site created');

    // Create area
    await db.insert(areas).values({
      id: areaId,
      siteId: siteId,
      name: 'Test Area',
    }).onConflictDoNothing();
    console.log('✓ Area created');

    // Create unit
    await db.insert(units).values({
      id: unitId,
      areaId: areaId,
      name: 'Test Fridge',
      unitType: 'fridge',
      tempMin: '32',
      tempMax: '41',
      status: 'normal',
      isActive: true,
    }).onConflictDoNothing();
    console.log('✓ Unit created');

    console.log('\n✅ Seed data created successfully!');
    console.log('You can now go to /dashboard or /settings');

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

seed();
