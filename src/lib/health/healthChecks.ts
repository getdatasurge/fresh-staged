import { 
  HealthCheckResult, 
  SystemHealth, 
  EdgeFunctionInfo,
  computeOverallStatus, 
  computeSummary 
} from './types';
import { EDGE_FUNCTIONS } from './edgeFunctionList';

/**
 * Check a single edge function's health
 */
export async function checkEdgeFunctionHealth(
  fn: EdgeFunctionInfo
): Promise<HealthCheckResult> {
  const id = `edge_${fn.name}`;

  if (fn.checkMethod === 'skip') {
    return {
      id,
      name: fn.name,
      category: 'edge_function',
      status: 'healthy',
      checkedAt: new Date(),
      skipped: true,
      skipReason: fn.skipReason || 'Cannot be tested directly',
      details: { description: fn.description },
    };
  }

  return {
    id,
    name: fn.name,
    category: 'edge_function',
    status: 'unknown',
    checkedAt: new Date(),
    skipped: true,
    skipReason: 'Supabase edge functions removed from client checks',
    details: { description: fn.description, critical: fn.critical },
  };
}

export async function checkDatabaseHealth(): Promise<HealthCheckResult[]> {
  return [
    {
      id: 'db_connectivity',
      name: 'Database Connectivity',
      category: 'database',
      status: 'unknown',
      checkedAt: new Date(),
      skipped: true,
      skipReason: 'Client database checks removed with Supabase',
    },
    {
      id: 'db_query',
      name: 'Database Query',
      category: 'database',
      status: 'unknown',
      checkedAt: new Date(),
      skipped: true,
      skipReason: 'Client database checks removed with Supabase',
    },
  ];
}

export async function checkTTNHealth(orgId: string | null): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];

  if (!orgId) {
    results.push({
      id: 'ttn_config',
      name: 'TTN Configuration',
      category: 'ttn',
      status: 'unknown',
      checkedAt: new Date(),
      skipped: true,
      skipReason: 'No organization context',
    });
    return results;
  }

  results.push({
    id: 'ttn_config',
    name: 'TTN Configuration',
    category: 'ttn',
    status: 'unknown',
    checkedAt: new Date(),
    skipped: true,
    skipReason: 'TTN health check pending backend endpoint',
  });

  return results;
}

export async function runAllHealthChecks(orgId: string | null): Promise<SystemHealth> {
  const startTime = new Date();

  // Run all checks in parallel
  const [edgeFunctionResults, databaseResults, ttnResults] = await Promise.all([
    Promise.all(EDGE_FUNCTIONS.map(fn => checkEdgeFunctionHealth(fn))),
    checkDatabaseHealth(),
    checkTTNHealth(orgId),
  ]);

  const allChecks = [...edgeFunctionResults, ...databaseResults, ...ttnResults];

  return {
    overall: computeOverallStatus(allChecks),
    lastCheckedAt: startTime,
    checks: allChecks,
    summary: computeSummary(allChecks),
  };
}

/**
 * Run quick health check (critical functions only)
 */
export async function runQuickHealthCheck(orgId: string | null): Promise<SystemHealth> {
  const startTime = new Date();

  const criticalFunctions = EDGE_FUNCTIONS.filter(f => f.critical);

  const [edgeFunctionResults, databaseResults] = await Promise.all([
    Promise.all(criticalFunctions.map(fn => checkEdgeFunctionHealth(fn))),
    checkDatabaseHealth(),
  ]);

  const allChecks = [...edgeFunctionResults, ...databaseResults];

  return {
    overall: computeOverallStatus(allChecks),
    lastCheckedAt: startTime,
    checks: allChecks,
    summary: computeSummary(allChecks),
  };
}
