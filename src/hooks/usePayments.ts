/**
 * Payments Domain Hooks
 *
 * tRPC-based hooks for Stripe billing operations.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Created in Phase 21 (Plan 05).
 *
 * @example
 * ```tsx
 * // Get subscription details
 * const { data: subscription } = useSubscription(organizationId);
 * if (subscription?.status === 'active') {
 *   // Show active subscription UI
 * }
 *
 * // Create checkout session for subscription
 * const createCheckout = useCreateCheckoutSession();
 * const result = await createCheckout.mutateAsync({
 *   organizationId: 'uuid',
 *   data: {
 *     priceId: 'price_xxx',
 *     successUrl: window.location.origin + '/billing?success=true',
 *     cancelUrl: window.location.origin + '/billing?canceled=true',
 *   }
 * });
 * window.location.href = result.url;
 *
 * // Open billing portal
 * const createPortal = useCreatePortalSession();
 * const portal = await createPortal.mutateAsync({
 *   organizationId: 'uuid',
 *   data: {
 *     returnUrl: window.location.origin + '/billing',
 *   }
 * });
 * window.location.href = portal.url;
 * ```
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/lib/trpc";

/**
 * Subscription status values
 */
export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "paused"
  | "trialing"
  | "unpaid";

/**
 * Subscription response shape
 */
export interface SubscriptionResponse {
  id: string;
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  priceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  sensorLimit: number;
  deviceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Checkout session response
 */
export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

/**
 * Portal session response
 */
export interface PortalSessionResponse {
  url: string;
}

/**
 * Input for creating checkout session
 */
export interface CreateCheckoutInput {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Input for creating portal session
 */
export interface CreatePortalInput {
  returnUrl: string;
}

/**
 * Hook to fetch organization's subscription details
 *
 * @param organizationId - Organization UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with subscription data or null
 */
export function useSubscription(
  organizationId: string | undefined,
  options?: { enabled?: boolean }
) {
  const trpc = useTRPC();

  const queryOptions = trpc.payments.getSubscription.queryOptions({
    organizationId: organizationId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && (options?.enabled !== false),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Hook to create Stripe checkout session
 *
 * Creates a checkout session for subscription purchase.
 * Returns session ID and redirect URL.
 *
 * @returns Mutation hook for creating checkout session
 */
export function useCreateCheckoutSession() {
  const client = useTRPCClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      data: CreateCheckoutInput;
    }) => {
      return client.payments.createCheckoutSession.mutate({
        organizationId: variables.organizationId,
        data: variables.data,
      });
    },
  });
}

/**
 * Hook to create Stripe billing portal session
 *
 * Creates a billing portal session for subscription management.
 * Returns redirect URL to Stripe's customer portal.
 *
 * @returns Mutation hook for creating portal session
 */
export function useCreatePortalSession() {
  const client = useTRPCClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      data: CreatePortalInput;
    }) => {
      return client.payments.createPortalSession.mutate({
        organizationId: variables.organizationId,
        data: variables.data,
      });
    },
  });
}

/**
 * Helper to check if subscription is active
 */
export function isSubscriptionActive(
  subscription: SubscriptionResponse | null | undefined
): boolean {
  return subscription?.status === "active" || subscription?.status === "trialing";
}

/**
 * Helper to check if subscription allows more sensors
 */
export function hasAvailableSensorCapacity(
  subscription: SubscriptionResponse | null | undefined
): boolean {
  if (!subscription) return false;
  return subscription.deviceCount < subscription.sensorLimit;
}

/**
 * Helper to get remaining sensor capacity
 */
export function getRemainingCapacity(
  subscription: SubscriptionResponse | null | undefined
): number {
  if (!subscription) return 0;
  return Math.max(0, subscription.sensorLimit - subscription.deviceCount);
}
