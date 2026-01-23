"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import type { FeatureEntitlement, FeatureGroup } from "@/services/featureFlags";
import { getUserFeatureEntitlement, getFeatureGroupsByIds, isFeatureEnabledInGroups, isGroupEnabled, DEFAULT_GUEST_ENTITLEMENT } from "@/services/featureFlags";
import { auth } from "@/lib/firebase";
import { Role } from "@/lib/rbac/types";

// Cache configuration
const CACHE_KEY_PREFIX = "clockit_features_";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedData {
  entitlement: FeatureEntitlement;
  featureGroups: FeatureGroup[];
  timestamp: number;
  userId: string;
}

interface FeatureFlagsContextValue {
  entitlement: FeatureEntitlement;
  featureGroups: FeatureGroup[];
  loading: boolean;
  error: Error | null;
  isFeatureEnabled: (feature: string) => boolean;
  isGroupEnabled: (group: string) => boolean;
  clearCache: () => void;
  refetch: () => Promise<void>;
  isAdmin: boolean;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

interface FeatureFlagsProviderProps {
  children: ReactNode;
  userId?: string | null;
}

export function FeatureFlagsProvider({ children, userId }: FeatureFlagsProviderProps) {
  const [entitlement, setEntitlement] = useState<FeatureEntitlement>(DEFAULT_GUEST_ENTITLEMENT);
  const [featureGroups, setFeatureGroups] = useState<FeatureGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Generate cache key for current user
  const getCacheKey = useCallback((uid: string) => {
    return `${CACHE_KEY_PREFIX}${uid}`;
  }, []);

  // Load from session storage
  const loadFromCache = useCallback((uid: string): CachedData | null => {
    try {
      const cacheKey = getCacheKey(uid);
      const cached = sessionStorage.getItem(cacheKey);

      if (!cached) return null;

      const data: CachedData = JSON.parse(cached);

      // Check if cache is still valid
      const now = Date.now();
      const age = now - data.timestamp;

      if (age > CACHE_TTL_MS) {
        // Cache expired, remove it
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      // Verify it's for the correct user
      if (data.userId !== uid) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      return data;
    } catch (err) {
      console.error("Error loading from cache:", err);
      return null;
    }
  }, [getCacheKey]);

  // Save to session storage
  const saveToCache = useCallback((uid: string, ent: FeatureEntitlement, groups: FeatureGroup[]) => {
    try {
      const cacheKey = getCacheKey(uid);
      const data: CachedData = {
        entitlement: ent,
        featureGroups: groups,
        timestamp: Date.now(),
        userId: uid,
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (err) {
      console.error("Error saving to cache:", err);
    }
  }, [getCacheKey]);

  // Clear cache for current user
  const clearCache = useCallback(() => {
    if (!userId) return;

    try {
      const cacheKey = getCacheKey(userId);
      sessionStorage.removeItem(cacheKey);
    } catch (err) {
      console.error("Error clearing cache:", err);
    }
  }, [userId, getCacheKey]);

  // Clear all feature flag caches (useful on logout)
  const clearAllCaches = useCallback(() => {
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (err) {
      console.error("Error clearing all caches:", err);
    }
  }, []);

  // Fetch feature flags from API
  const fetchFeatureFlags = useCallback(async (uid: string, useCache = true): Promise<void> => {
    // Try to load from cache first
    if (useCache) {
      const cached = loadFromCache(uid);
      if (cached) {
        setEntitlement(cached.entitlement);
        setFeatureGroups(cached.featureGroups);
        setError(null);
        return;
      }
    }

    // Fetch from API
    setLoading(true);
    setError(null);

    try {
      const loaded = await getUserFeatureEntitlement(uid);

      let groups: FeatureGroup[] = [];
      if (loaded.featureGroups && loaded.featureGroups.length > 0) {
        groups = await getFeatureGroupsByIds(loaded.featureGroups);
      }

      setEntitlement(loaded);
      setFeatureGroups(groups);

      // Save to cache
      saveToCache(uid, loaded, groups);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Failed to load feature flags");
      setError(errorObj);

      // On error, use default guest entitlement
      setEntitlement(DEFAULT_GUEST_ENTITLEMENT);
      setFeatureGroups([]);
    } finally {
      setLoading(false);
    }
  }, [loadFromCache, saveToCache]);

  // Refetch (bypass cache)
  const refetch = useCallback(async () => {
    if (!userId) return;
    clearCache();
    await fetchFeatureFlags(userId, false);
  }, [userId, fetchFeatureFlags, clearCache]);

  // Check if user is admin (from Firebase custom claims)
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!userId) {
        setIsAdmin(false);
        return;
      }

      try {
        const user = auth.currentUser;
        if (!user) {
          setIsAdmin(false);
          return;
        }

        const idTokenResult = await user.getIdTokenResult();
        const userRole = idTokenResult.claims.role as Role;

        // Admin or Super Admin have global access
        const isAdminUser = userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN;
        setIsAdmin(isAdminUser);
      } catch (err) {
        console.error("Error checking admin status:", err);
        setIsAdmin(false);
      }
    };

    void checkAdminStatus();
  }, [userId]);

  // Load feature flags when userId changes
  useEffect(() => {
    if (!userId) {
      const loadGuestFlags = async () => {
        setLoading(true);
        setError(null);
        try {
          const guestEntitlement = await getUserFeatureEntitlement(null);
          const groups = guestEntitlement.featureGroups?.length
            ? await getFeatureGroupsByIds(guestEntitlement.featureGroups)
            : [];
          setEntitlement(guestEntitlement);
          setFeatureGroups(groups);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error("Failed to load guest feature flags");
          setError(errorObj);
          setEntitlement(DEFAULT_GUEST_ENTITLEMENT);
          setFeatureGroups([]);
        } finally {
          setLoading(false);
        }
      };

      void loadGuestFlags();
      return;
    }

    void fetchFeatureFlags(userId);
  }, [userId, fetchFeatureFlags]);

  // Clear all caches when user logs out (userId becomes null)
  useEffect(() => {
    if (userId === null || userId === undefined) {
      // User logged out, clear all caches
      clearAllCaches();
    }
  }, [userId, clearAllCaches]);

  // Feature checking functions
  const checkFeatureEnabled = useCallback((feature: string): boolean => {
    // Admins have access to ALL features, bypassing feature flags
    if (isAdmin) return true;

    return isFeatureEnabledInGroups(featureGroups, feature);
  }, [featureGroups, isAdmin]);

  const checkGroupEnabled = useCallback((group: string): boolean => {
    // Admins have access to ALL feature groups, bypassing feature flags
    if (isAdmin) return true;

    return isGroupEnabled(entitlement, group);
  }, [entitlement, isAdmin]);

  const value: FeatureFlagsContextValue = {
    entitlement,
    featureGroups,
    loading,
    error,
    isFeatureEnabled: checkFeatureEnabled,
    isGroupEnabled: checkGroupEnabled,
    clearCache,
    refetch,
    isAdmin,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

// Hook to use feature flags context
export function useFeatureFlagsContext(): FeatureFlagsContextValue {
  const context = useContext(FeatureFlagsContext);

  if (!context) {
    throw new Error("useFeatureFlagsContext must be used within a FeatureFlagsProvider");
  }

  return context;
}

// Export context for advanced usage
export { FeatureFlagsContext };
