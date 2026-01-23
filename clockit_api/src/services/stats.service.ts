import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from './firestore.service';
import type { MaterializedStats, Achievement } from '@/types/stats.types';

const MATERIALIZED_STATS_COLLECTION = 'MaterializedStats';
const ACHIEVEMENTS_COLLECTION = 'Achievements';

export class StatsService {
  /**
   * Get materialized stats for a user
   * Note: Caching is handled by middleware
   */
  static async getStats(uid: string): Promise<MaterializedStats | null> {
    const documentPath = `${MATERIALIZED_STATS_COLLECTION}/${uid}`;
    const stats = await FirestoreService.getDocument<MaterializedStats>(documentPath);
    //convert the Firebase Timestamp fields to ISO strings if they exist
    if (stats) {
      if ((stats as any).updatedAt) {
        const ts = (stats as any).updatedAt as Timestamp;
        (stats as any).updatedAt = ts.toDate().toISOString();
      }
      if ((stats as any).lastAggregatedAt
) {
        const dt = (stats as any).lastAggregatedAt as Timestamp;
        (stats as any).lastAggregatedAt = dt.toDate().toISOString();
      }
    }
    return stats;
  }

  /**
   * Request stats refresh
   */
  static async refreshStats(uid: string): Promise<void> {
    const documentPath = `${MATERIALIZED_STATS_COLLECTION}/${uid}`;
    const now = new Date().toISOString();

    await FirestoreService.setDocument(
      documentPath,
      { lastRefreshRequested: now },
      true // merge
    );
  }

  /**
   * Save achievement/badge
   */
  static async saveAchievement(uid: string, achievement: Achievement): Promise<void> {
    const documentPath = `${ACHIEVEMENTS_COLLECTION}/${uid}_${achievement.id}`;
    await FirestoreService.setDocument(documentPath, {
      uid,
      ...achievement,
      earnedAt: achievement.earnedAt || new Date().toISOString(),
    });
  }
}
