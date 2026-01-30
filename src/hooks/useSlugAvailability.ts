import { useState, useEffect, useRef, useCallback } from 'react';

// Simple logging for slug availability checks
const logSlugCheck = (message: string, data?: Record<string, unknown>) => {
  if (import.meta.env.DEV) {
    console.log(`[slug-check] ${message}`, data || '');
  }
};

interface SlugStatus {
  isChecking: boolean;
  available: boolean | null;
  normalizedSlug: string;
  suggestions: string[];
  conflicts: string[];
  error: string | null;
}

interface UseSlugAvailabilityOptions {
  debounceMs?: number;
  excludeOrgId?: string | null;
  minLength?: number;
}

const generateClientSideSuggestions = (slug: string): string[] => {
  if (!slug || slug.length < 2) return [];
  const year = new Date().getFullYear();
  return [`${slug}-2`, `${slug}-${year}`, `my-${slug}`, `${slug}-co`, `${slug}-app`];
};

export function useSlugAvailability(slug: string, options: UseSlugAvailabilityOptions = {}) {
  const { debounceMs = 500, excludeOrgId = null, minLength = 2 } = options;

  const [status, setStatus] = useState<SlugStatus>({
    isChecking: false,
    available: null,
    normalizedSlug: '',
    suggestions: [],
    conflicts: [],
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const checkSlug = useCallback(
    async (slugToCheck: string) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Normalize the slug client-side for preview
      const normalized = slugToCheck
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      if (!normalized || normalized.length < minLength) {
        setStatus({
          isChecking: false,
          available: null,
          normalizedSlug: normalized,
          suggestions: [],
          conflicts: [],
          error: null,
        });
        return;
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      setStatus((prev) => ({
        ...prev,
        isChecking: true,
        normalizedSlug: normalized,
        error: null,
      }));

      logSlugCheck(`Checking slug availability: "${normalized}"`, {
        original: slugToCheck,
        normalized,
        excludeOrgId,
      });

      const suggestions = generateClientSideSuggestions(normalized);

      setStatus({
        isChecking: false,
        available: null,
        normalizedSlug: normalized,
        suggestions,
        conflicts: [],
        error: 'Slug availability check is unavailable during Supabase removal.',
      });
    },
    [excludeOrgId, minLength],
  );

  // Debounced effect
  useEffect(() => {
    if (!slug) {
      setStatus({
        isChecking: false,
        available: null,
        normalizedSlug: '',
        suggestions: [],
        conflicts: [],
        error: null,
      });
      return;
    }

    const timer = setTimeout(() => {
      checkSlug(slug);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [slug, debounceMs, checkSlug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStatus({
      isChecking: false,
      available: null,
      normalizedSlug: '',
      suggestions: [],
      conflicts: [],
      error: null,
    });
  }, []);

  return { status, reset };
}
