import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { appRoleEnum } from './enums.js';
import { organizations } from './tenancy.js';

// Reusable timestamp columns
const timestamps = {
  createdAt: timestamp('created_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
};

// Profiles - user profile data linked to auth.users
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // References external auth provider (Stack Auth user ID)
    userId: uuid('user_id').notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    email: varchar('email', { length: 256 }).notNull(),
    fullName: varchar('full_name', { length: 256 }),
    avatarUrl: text('avatar_url'),
    phone: varchar('phone', { length: 50 }),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    smsEnabled: boolean('sms_enabled').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('profiles_user_id_idx').on(table.userId),
    index('profiles_org_idx').on(table.organizationId),
    index('profiles_email_idx').on(table.email),
  ]
);

// User Roles - role assignments per organization
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    role: appRoleEnum('role').notNull().default('viewer'),
    ...timestamps,
  },
  (table) => [
    // Unique constraint: one role per user per org
    uniqueIndex('user_roles_user_org_idx').on(table.userId, table.organizationId),
    index('user_roles_org_idx').on(table.organizationId),
  ]
);

// Escalation Contacts - alert notification recipients
export const escalationContacts = pgTable(
  'escalation_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    profileId: uuid('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 256 }).notNull(),
    phone: varchar('phone', { length: 50 }).notNull(),
    email: varchar('email', { length: 256 }),
    priority: integer('priority').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('escalation_contacts_org_idx').on(table.organizationId),
    index('escalation_contacts_profile_idx').on(table.profileId),
    index('escalation_contacts_priority_idx').on(
      table.organizationId,
      table.priority
    ),
  ]
);

// Type exports
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;
export type EscalationContact = typeof escalationContacts.$inferSelect;
export type InsertEscalationContact = typeof escalationContacts.$inferInsert;
