/**
 * Accessibility Smoke Tests for Key Pages
 *
 * These tests render each major page component with mocked dependencies
 * and run axe-core to detect accessibility violations. They serve as
 * automated regression tests to catch a11y issues introduced by future
 * changes.
 *
 * Pages tested: Dashboard, Sites, Units, Alerts
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { createQueryOptionsMock } from '@/test/trpc-test-utils';

// ---------------------------------------------------------------------------
// Module mocks (must be before page imports)
// ---------------------------------------------------------------------------

// Mock Stack Auth
vi.mock('@stackframe/react', () => ({
  useUser: vi.fn(() => ({
    id: 'user-1',
    displayName: 'Test User',
    primaryEmail: 'test@example.com',
    getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
  })),
  useStackApp: vi.fn(() => ({
    signOut: vi.fn(),
  })),
}));

// Mock tRPC
const mockUseTRPC = vi.fn();
vi.mock('@/lib/trpc', () => ({
  useTRPC: () => mockUseTRPC(),
}));

// Mock useEffectiveIdentity
vi.mock('@/hooks/useEffectiveIdentity', () => ({
  useEffectiveIdentity: vi.fn(() => ({
    effectiveOrgId: 'org-1',
    effectiveOrgName: 'Test Org',
    isImpersonating: false,
    isInitialized: true,
    impersonationChecked: true,
  })),
}));

// Mock SuperAdmin context
vi.mock('@/contexts/SuperAdminContext', () => ({
  useSuperAdmin: vi.fn(() => ({
    isSuperAdmin: false,
    isLoadingSuperAdmin: false,
    rolesLoaded: true,
    isSupportModeActive: false,
    impersonation: { isImpersonating: false, targetOrgId: null },
    viewingOrg: { orgId: null, orgName: null },
  })),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock useUserRole / usePermissions
vi.mock('@/hooks/useUserRole', () => ({
  usePermissions: vi.fn(() => ({
    canDeleteEntities: false,
    isLoading: false,
  })),
  useUserRole: vi.fn(() => ({
    role: 'viewer',
    isLoading: false,
  })),
}));

// Mock useUnitAlerts
vi.mock('@/hooks/useUnitAlerts', () => ({
  useUnitAlerts: vi.fn(() => ({
    alerts: [],
    isLoading: false,
  })),
  computeUnitAlerts: vi.fn(() => ({
    alerts: [],
    unitsWithAlerts: 0,
    unitsOk: 0,
  })),
}));

// Mock useUnitStatus
vi.mock('@/hooks/useUnitStatus', () => ({
  computeUnitStatus: vi.fn(() => ({
    status: 'ok',
    label: 'OK',
    color: 'green',
  })),
  UnitStatusInfo: {},
}));

// Mock offline storage
vi.mock('@/lib/offlineStorage', () => ({
  clearOfflineStorage: vi.fn(),
}));

// Mock sidebar accordion components to simplify rendering
vi.mock('@/components/sidebar', () => ({
  SidebarSitesAccordion: () => <nav aria-label="Sites navigation" />,
  SidebarUnitsAccordion: () => <nav aria-label="Units navigation" />,
}));

// Mock NotificationDropdown to simplify rendering
vi.mock('@/components/NotificationDropdown', () => ({
  default: () => (
    <button type="button" aria-label="Notifications">
      0
    </button>
  ),
}));

// Mock ConnectionStatus
vi.mock('@/components/common/ConnectionStatus', () => ({
  ConnectionStatus: () => <span role="status" aria-label="Connection status" />,
}));

// Mock BrandedLogo
vi.mock('@/components/BrandedLogo', () => ({
  default: () => <span role="img" aria-label="Logo" />,
}));

// Mock ThemeToggle
vi.mock('@/components/ThemeToggle', () => ({
  default: () => (
    <button type="button" aria-label="Toggle theme">
      Theme
    </button>
  ),
}));

// Mock MigrationErrorBoundary
vi.mock('@/components/errors/MigrationErrorBoundary', () => ({
  MigrationErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock SupportModeBanner and ImpersonationBanner
vi.mock('@/components/platform/SupportModeBanner', () => ({
  SupportModeBanner: () => null,
  ImpersonationBanner: () => null,
}));

// Mock SupportDiagnosticsPanel
vi.mock('@/components/platform/SupportDiagnosticsPanel', () => ({
  SupportDiagnosticsPanel: () => null,
}));

// Mock RBACDebugPanel
vi.mock('@/components/debug/RBACDebugPanel', () => ({
  RBACDebugPanel: () => null,
}));

// Mock LogTempModal
vi.mock('@/components/LogTempModal', () => ({
  default: () => null,
  LogTempUnit: {},
}));

// Mock alert config helpers
vi.mock('@/lib/alertConfig', () => ({
  getAlertTypeConfig: vi.fn(() => ({
    label: 'Test Alert',
    icon: 'AlertTriangle',
    color: 'red',
  })),
  getSeverityConfig: vi.fn(() => ({
    label: 'Critical',
    color: 'red',
  })),
}));

// Mock statusConfig
vi.mock('@/lib/statusConfig', () => ({
  STATUS_CONFIG: {
    ok: { label: 'OK', color: 'green', icon: 'CheckCircle2' },
    warning: { label: 'Warning', color: 'yellow', icon: 'AlertTriangle' },
    critical: { label: 'Critical', color: 'red', icon: 'AlertCircle' },
  },
}));

// ---------------------------------------------------------------------------
// Page imports (after mocks)
// ---------------------------------------------------------------------------
import Dashboard from '@/pages/Dashboard';
import Sites from '@/pages/Sites';
import Units from '@/pages/Units';
import Alerts from '@/pages/Alerts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** Default tRPC mock structure covering routes used by all 4 pages */
function setupDefaultTRPCMock() {
  const emptyQueryOptions = createQueryOptionsMock([], {
    queryKey: ['mock', 'empty'],
  });
  const emptyStatsQueryOptions = createQueryOptionsMock(
    { unitCounts: { total: 0, ok: 0, warning: 0, critical: 0 }, siteCount: 0 },
    { queryKey: ['organizations', 'stats', { organizationId: 'org-1' }] },
  );
  const emptyMutationOptions = vi.fn().mockReturnValue({
    mutationKey: ['mock', 'mutation'],
    mutationFn: vi.fn().mockResolvedValue({}),
  });

  mockUseTRPC.mockReturnValue({
    organizations: {
      stats: { queryOptions: emptyStatsQueryOptions },
    },
    sites: {
      list: { queryOptions: emptyQueryOptions },
      create: { mutationOptions: emptyMutationOptions },
    },
    units: {
      listByOrg: { queryOptions: emptyQueryOptions },
    },
    alerts: {
      listByOrg: { queryOptions: emptyQueryOptions },
      list: { queryOptions: emptyQueryOptions },
      acknowledge: { mutationOptions: emptyMutationOptions },
      resolve: { mutationOptions: emptyMutationOptions },
    },
    notifications: {
      listByOrg: { queryOptions: emptyQueryOptions },
      preferences: {
        get: { queryOptions: emptyQueryOptions },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// Configure axe to skip heading-order rule. When pages are rendered in
// isolation the heading hierarchy (h1 > h2 > h3) may appear broken because
// DashboardLayout injects its own headings and we mock sub-components.
// heading-order is a best-practice rule, not a WCAG A/AA requirement.
const AXE_OPTIONS = {
  rules: {
    'heading-order': { enabled: false },
  },
};

describe('Page Accessibility Smoke Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultTRPCMock();

    // Provide a localStorage stub for happy-dom (Units page reads from it)
    if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
      const store: Record<string, string> = {};
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: vi.fn((key: string) => store[key] ?? null),
          setItem: vi.fn((key: string, val: string) => {
            store[key] = val;
          }),
          removeItem: vi.fn((key: string) => {
            delete store[key];
          }),
          clear: vi.fn(() => {
            Object.keys(store).forEach((k) => delete store[k]);
          }),
          key: vi.fn((_i: number) => null),
          get length() {
            return Object.keys(store).length;
          },
        },
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    cleanup();
  });

  it('Dashboard page has no a11y violations', async () => {
    const { container } = render(<Dashboard />, { wrapper: TestWrapper });

    // Wait for loading states to settle
    await waitFor(
      () => {
        expect(container.querySelector('[class*="animate-"]')).toBeFalsy();
      },
      { timeout: 3000 },
    );

    const results = await axe(container, AXE_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('Sites page has no a11y violations', async () => {
    const { container } = render(<Sites />, { wrapper: TestWrapper });

    await waitFor(
      () => {
        expect(container.querySelector('[class*="animate-"]')).toBeFalsy();
      },
      { timeout: 3000 },
    );

    const results = await axe(container, AXE_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('Units page has no a11y violations', async () => {
    const { container } = render(<Units />, { wrapper: TestWrapper });

    await waitFor(
      () => {
        expect(container.querySelector('[class*="animate-"]')).toBeFalsy();
      },
      { timeout: 3000 },
    );

    const results = await axe(container, AXE_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('Alerts page has no a11y violations', async () => {
    const { container } = render(<Alerts />, { wrapper: TestWrapper });

    await waitFor(
      () => {
        expect(container.querySelector('[class*="animate-"]')).toBeFalsy();
      },
      { timeout: 3000 },
    );

    const results = await axe(container, AXE_OPTIONS);
    expect(results).toHaveNoViolations();
  });
});
