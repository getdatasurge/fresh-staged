/**
 * Stripe Meter Service - Usage-based billing integration
 *
 * Reports usage metrics to Stripe Billing Meters API:
 * - Active sensors: uses 'last' aggregation (final count in period billed)
 * - Temperature readings: uses 'sum' aggregation (total readings billed)
 *
 * Important: Meters must be created in Stripe Dashboard with matching event_names:
 * - 'active_sensors' meter with 'last' formula
 * - 'temperature_readings' meter with 'sum' formula
 */

import Stripe from 'stripe';
import { db } from '../db/client.js';
import { subscriptions } from '../db/schema/tenancy.js';
import { eq } from 'drizzle-orm';

// Lazy-initialized Stripe client
let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
    });
  }
  return stripeClient;
}

export class StripeMeterService {
  private static instance: StripeMeterService | null = null;

  static getInstance(): StripeMeterService {
    if (!StripeMeterService.instance) {
      StripeMeterService.instance = new StripeMeterService();
    }
    return StripeMeterService.instance;
  }

  /**
   * Report active sensor count for an organization
   * Uses 'last' aggregation - only the final value in the billing period is billed
   *
   * @param organizationId - Organization UUID
   * @param sensorCount - Current count of active sensors
   */
  async reportActiveSensors(
    organizationId: string,
    sensorCount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const customerId = await this.getStripeCustomerId(organizationId);
      if (!customerId) {
        // No Stripe customer yet - org hasn't subscribed
        return { success: false, error: 'No Stripe customer for organization' };
      }

      const stripe = getStripeClient();
      await stripe.billing.meterEvents.create({
        event_name: 'active_sensors',
        payload: {
          stripe_customer_id: customerId,
          value: Math.max(0, Math.floor(sensorCount)).toString(),
        },
      });

      console.log(`[Meter] Reported ${sensorCount} active sensors for org ${organizationId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Meter] Failed to report active sensors: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Report temperature reading volume for an organization
   * Uses 'sum' aggregation - all values in the billing period are added together
   *
   * @param organizationId - Organization UUID
   * @param readingCount - Number of readings ingested
   */
  async reportReadingVolume(
    organizationId: string,
    readingCount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const customerId = await this.getStripeCustomerId(organizationId);
      if (!customerId) {
        return { success: false, error: 'No Stripe customer for organization' };
      }

      const stripe = getStripeClient();
      await stripe.billing.meterEvents.create({
        event_name: 'temperature_readings',
        payload: {
          stripe_customer_id: customerId,
          value: Math.max(0, Math.floor(readingCount)).toString(),
        },
      });

      console.log(`[Meter] Reported ${readingCount} readings for org ${organizationId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Meter] Failed to report reading volume: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Report active sensor count with explicit timestamp
   * Use for historical reporting or scheduled batch updates
   *
   * @param organizationId - Organization UUID
   * @param sensorCount - Current count of active sensors
   * @param timestamp - Unix timestamp in seconds
   */
  async reportActiveSensorsWithTimestamp(
    organizationId: string,
    sensorCount: number,
    timestamp: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const customerId = await this.getStripeCustomerId(organizationId);
      if (!customerId) {
        return { success: false, error: 'No Stripe customer for organization' };
      }

      const stripe = getStripeClient();
      await stripe.billing.meterEvents.create({
        event_name: 'active_sensors',
        payload: {
          stripe_customer_id: customerId,
          value: Math.max(0, Math.floor(sensorCount)).toString(),
        },
        timestamp,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Lookup Stripe customer ID for an organization
   */
  private async getStripeCustomerId(organizationId: string): Promise<string | null> {
    const [sub] = await db
      .select({ customerId: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);

    return sub?.customerId || null;
  }
}

// Singleton accessor
export function getStripeMeterService(): StripeMeterService {
  return StripeMeterService.getInstance();
}
