/**
 * TTN Crypto Utilities
 * Ported from supabase/functions/_shared/ttnConfig.ts
 */

export class TtnCrypto {
  /**
   * Deobfuscate a key
   * Supports: 'b64:' (plain base64), 'v2:' (XOR v2), and legacy (v1 XOR)
   */
  static deobfuscateKey(encoded: string | null, salt: string): string {
    if (!encoded) return "";

    // Handle b64: prefix (Plain Base64)
    if (encoded.startsWith("b64:")) {
      try {
        return Buffer.from(encoded.slice(4), 'base64').toString('utf-8');
      } catch (err) {
        console.error("[deobfuscateKey] Failed to decode b64:", err);
        return "";
      }
    }

    // Handle v2: prefix (XOR v2)
    if (encoded.startsWith("v2:")) {
      return this.deobfuscateKeyV2(encoded, salt);
    }

    // Legacy (v1)
    return this.legacyDeobfuscateKey(encoded, salt);
  }

  /**
   * Obfuscate a key
   * Currently uses 'b64:' format for stability
   */
  static obfuscateKey(key: string, salt: string): string {
    return `b64:${Buffer.from(key).toString('base64')}`;
  }

  private static deobfuscateKeyV2(encoded: string, salt: string): string {
    const b64 = encoded.slice(3);
    try {
      const encryptedBytes = Buffer.from(b64, 'base64');
      const saltBytes = Buffer.from(salt, 'utf-8');
      const result = Buffer.alloc(encryptedBytes.length);

      for (let i = 0; i < encryptedBytes.length; i++) {
        result[i] = encryptedBytes[i] ^ saltBytes[i % saltBytes.length];
      }

      return result.toString('utf-8');
    } catch (err) {
      console.error("[deobfuscateKeyV2] Failed to decode:", err);
      return "";
    }
  }

  private static legacyDeobfuscateKey(encoded: string, salt: string): string {
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('binary');
      let result = "";
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
      }
      return result;
    } catch {
      console.warn("[legacyDeobfuscateKey] Failed to decode");
      return "";
    }
  }
}
