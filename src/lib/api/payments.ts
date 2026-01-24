import { createAuthenticatedClient } from '../api-client';
import type {
  SubscriptionResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  PortalSessionRequest,
  PortalSessionResponse,
} from '../api-types';

export const paymentsApi = {
  /**
   * Get subscription details for an organization
   * GET /api/orgs/:orgId/payments/subscription
   */
  getSubscription: async (
    orgId: string,
    accessToken: string
  ): Promise<SubscriptionResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}/payments/subscription`).json<SubscriptionResponse>();
  },

  /**
   * Create a Stripe checkout session
   * POST /api/orgs/:orgId/payments/checkout
   */
  createCheckoutSession: async (
    orgId: string,
    request: CheckoutSessionRequest,
    accessToken: string
  ): Promise<CheckoutSessionResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .post(`api/orgs/${orgId}/payments/checkout`, { json: request })
      .json<CheckoutSessionResponse>();
  },

  /**
   * Create a Stripe billing portal session
   * POST /api/orgs/:orgId/payments/portal
   */
  createPortalSession: async (
    orgId: string,
    request: PortalSessionRequest,
    accessToken: string
  ): Promise<PortalSessionResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .post(`api/orgs/${orgId}/payments/portal`, { json: request })
      .json<PortalSessionResponse>();
  },
};
