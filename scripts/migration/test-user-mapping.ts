/**
 * Unit test for user-mapping.ts
 * Run: pnpm exec tsx test-user-mapping.ts
 */

import {
  saveMapping,
  loadMapping,
  getMappingStats,
  mapUserId,
  validateMappings,
  MAPPING_RETENTION_DAYS,
  DEFAULT_MAPPING_PATH,
  type UserMapping,
} from "./lib/user-mapping.js";
import fs from "node:fs";
import path from "node:path";

const testPath = "./migration-data/test-mapping.json";

async function runTests() {
  console.log("=== User Mapping Roundtrip Test ===\n");

  // Test 1: saveMapping
  console.log("Test 1: saveMapping...");
  const testMappings: UserMapping[] = [
    {
      supabaseUserId: "uuid-sup-1",
      stackAuthUserId: "uuid-stack-1",
      email: "test1@example.com",
      migratedAt: new Date().toISOString(),
    },
    {
      supabaseUserId: "uuid-sup-2",
      stackAuthUserId: "uuid-stack-2",
      email: "test2@example.com",
      migratedAt: new Date().toISOString(),
    },
  ];
  saveMapping(testPath, testMappings);
  console.log("  PASS: saveMapping completed\n");

  // Test 2: loadMapping
  console.log("Test 2: loadMapping...");
  const loaded = loadMapping(testPath);
  if (loaded.size !== 2) {
    throw new Error(`Expected 2 mappings, got ${loaded.size}`);
  }
  console.log("  PASS: loadMapping returned Map with 2 entries\n");

  // Test 3: mapUserId - found
  console.log("Test 3: mapUserId (found)...");
  const mapped1 = mapUserId(loaded, "uuid-sup-1");
  if (mapped1 !== "uuid-stack-1") {
    throw new Error(`Expected uuid-stack-1, got ${mapped1}`);
  }
  console.log("  PASS: mapUserId returned correct Stack Auth ID\n");

  // Test 4: mapUserId - not found
  console.log("Test 4: mapUserId (not found)...");
  const mappedNull = mapUserId(loaded, "nonexistent");
  if (mappedNull !== null) {
    throw new Error(`Expected null, got ${mappedNull}`);
  }
  console.log("  PASS: mapUserId returned null for unknown ID\n");

  // Test 5: getMappingStats
  console.log("Test 5: getMappingStats...");
  const stats = getMappingStats(testPath);
  if (!stats.exists) {
    throw new Error("Expected exists to be true");
  }
  if (stats.count !== 2) {
    throw new Error(`Expected count 2, got ${stats.count}`);
  }
  if (stats.ageInDays !== 0) {
    throw new Error(`Expected ageInDays 0, got ${stats.ageInDays}`);
  }
  console.log("  Stats:", JSON.stringify(stats, null, 2));
  console.log("  PASS: getMappingStats returned correct data\n");

  // Test 6: validateMappings
  console.log("Test 6: validateMappings...");
  const validation = validateMappings(loaded, ["uuid-sup-1", "uuid-sup-2", "uuid-sup-3"]);
  if (validation.valid) {
    throw new Error("Expected valid to be false (missing uuid-sup-3)");
  }
  if (validation.missingIds.length !== 1 || validation.missingIds[0] !== "uuid-sup-3") {
    throw new Error(`Expected missingIds to contain uuid-sup-3`);
  }
  console.log("  PASS: validateMappings correctly identified missing ID\n");

  // Test 7: Constants
  console.log("Test 7: Constants...");
  if (MAPPING_RETENTION_DAYS !== 90) {
    throw new Error(`Expected retention days 90, got ${MAPPING_RETENTION_DAYS}`);
  }
  if (DEFAULT_MAPPING_PATH !== "./migration-data/user-mapping.json") {
    throw new Error(`Unexpected default path: ${DEFAULT_MAPPING_PATH}`);
  }
  console.log("  PASS: Constants are correct\n");

  // Clean up
  fs.unlinkSync(path.resolve(testPath));
  console.log("=== ALL TESTS PASSED ===");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  // Clean up on failure
  try {
    fs.unlinkSync(path.resolve(testPath));
  } catch {
    // ignore
  }
  process.exit(1);
});
