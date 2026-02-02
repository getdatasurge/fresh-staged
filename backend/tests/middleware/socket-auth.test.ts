import * as jose from 'jose';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupSocketAuth } from '../../src/middleware/socket-auth.js';
import { userService } from '../../src/services/index.js';
import { verifyAccessToken } from '../../src/utils/jwt.js';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service
vi.mock('../../src/services/index.js', () => ({
  userService: {
    getUserPrimaryOrganization: vi.fn(),
    getOrCreateProfile: vi.fn(),
  },
}));

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetPrimaryOrg = vi.mocked(userService.getUserPrimaryOrganization);
const mockGetOrCreateProfile = vi.mocked(userService.getOrCreateProfile);

// Helper to create a mock Socket.io server
function createMockIO() {
  const middlewareFns: Array<(socket: any, next: any) => void> = [];
  return {
    use: vi.fn((fn: any) => middlewareFns.push(fn)),
    _middlewareFns: middlewareFns,
  };
}

// Helper to create a mock socket
function createMockSocket(token?: string) {
  return {
    handshake: {
      auth: token !== undefined ? { token } : {},
    },
    data: {} as Record<string, unknown>,
  };
}

describe('Socket.io Authentication Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register middleware via io.use()', () => {
    const io = createMockIO();
    setupSocketAuth(io as any);
    expect(io.use).toHaveBeenCalledOnce();
    expect(io._middlewareFns).toHaveLength(1);
  });

  it('should reject connection when no token is provided', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    const socket = createMockSocket(); // no token
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication token required',
      }),
    );
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('should reject connection when token verification fails', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    mockVerify.mockRejectedValue(new Error('Invalid token'));

    const socket = createMockSocket('bad.token');
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid or expired token',
      }),
    );
  });

  it('should return "Token expired" for JWTExpired errors', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    mockVerify.mockRejectedValue(new jose.errors.JWTExpired('token expired'));

    const socket = createMockSocket('expired.token');
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Token expired',
      }),
    );
  });

  it('should return "Invalid token claims" for JWTClaimValidationFailed', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    mockVerify.mockRejectedValue(new jose.errors.JWTClaimValidationFailed('aud mismatch'));

    const socket = createMockSocket('bad-claims.token');
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid token claims',
      }),
    );
  });

  it('should return "Invalid token signature" for JWSSignatureVerificationFailed', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    mockVerify.mockRejectedValue(new jose.errors.JWSSignatureVerificationFailed());

    const socket = createMockSocket('tampered.token');
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid token signature',
      }),
    );
  });

  it('should reject connection when user has no organization', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    mockVerify.mockResolvedValue({
      payload: { sub: 'user_1', email: 'test@test.com', name: 'Test' } as any,
      userId: 'user_1',
    });
    mockGetPrimaryOrg.mockResolvedValue(null as any);

    const socket = createMockSocket('valid.token');
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User has no organization access',
      }),
    );
  });

  it('should populate socket.data on successful authentication', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
    const TEST_PROFILE_ID = '00000000-0000-0000-0000-000000000099';

    mockVerify.mockResolvedValue({
      payload: { sub: 'user_1', email: 'test@test.com', name: 'Test User' } as any,
      userId: 'user_1',
    });
    mockGetPrimaryOrg.mockResolvedValue({
      organizationId: TEST_ORG_ID,
      role: 'admin',
    } as any);
    mockGetOrCreateProfile.mockResolvedValue({
      id: TEST_PROFILE_ID,
    } as any);

    const socket = createMockSocket('valid.token');
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    // next() called with no error = success
    expect(next).toHaveBeenCalledWith();
    expect(socket.data).toMatchObject({
      userId: 'user_1',
      organizationId: TEST_ORG_ID,
      role: 'admin',
      email: 'test@test.com',
      profileId: TEST_PROFILE_ID,
    });
  });

  it('should call getOrCreateProfile with correct arguments', async () => {
    const io = createMockIO();
    setupSocketAuth(io as any);

    const TEST_ORG_ID = '00000000-0000-0000-0000-000000000002';

    mockVerify.mockResolvedValue({
      payload: { sub: 'user_2', email: 'admin@org.com', name: 'Admin' } as any,
      userId: 'user_2',
    });
    mockGetPrimaryOrg.mockResolvedValue({
      organizationId: TEST_ORG_ID,
      role: 'owner',
    } as any);
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-1' } as any);

    const socket = createMockSocket('token');
    const next = vi.fn();

    await io._middlewareFns[0](socket, next);

    expect(mockGetOrCreateProfile).toHaveBeenCalledWith(
      'user_2',
      TEST_ORG_ID,
      'admin@org.com',
      'Admin',
    );
  });
});
