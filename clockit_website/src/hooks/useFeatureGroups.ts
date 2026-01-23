/**
 * Hook to fetch feature groups by IDs
 */

import { useState, useEffect } from 'react';
import { featureGroupsApi } from '@/lib/api-client';
import type { FeatureGroup } from '@/types/feature-group.types';

export function useFeatureGroups(featureGroupIds: string[] | undefined) {
  const [featureGroups, setFeatureGroups] = useState<FeatureGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchFeatureGroups() {
      if (!featureGroupIds || featureGroupIds.length === 0) {
        setFeatureGroups([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await featureGroupsApi.getByIds(featureGroupIds);
        setFeatureGroups(response.featureGroups);
      } catch (err) {
        console.error('Error fetching feature groups:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch feature groups'));
        setFeatureGroups([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFeatureGroups();
  }, [featureGroupIds]); // Join IDs for stable dependency

  return { featureGroups, loading, error };
}

/**
 * Hook to fetch all available feature groups
 */
export function useAllFeatureGroups(activeOnly = false) {
  const [featureGroups, setFeatureGroups] = useState<FeatureGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchAllFeatureGroups() {
      try {
        setLoading(true);
        setError(null);
        const response = await featureGroupsApi.list(activeOnly);
        setFeatureGroups(response.featureGroups);
      } catch (err) {
        console.error('Error fetching all feature groups:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch feature groups'));
        setFeatureGroups([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAllFeatureGroups();
  }, [activeOnly]);

  return { featureGroups, loading, error };
}
