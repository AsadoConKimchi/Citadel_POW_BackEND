// ============================================
// Cache Invalidation Helper
// ============================================

import type { KVNamespace } from '@cloudflare/workers-types';

/**
 * 랭킹 캐시 무효화
 * 새 POW 세션 또는 기부 생성 시 호출
 */
export async function invalidateRankingsCache(cache: KVNamespace): Promise<void> {
  try {
    // 랭킹 캐시 키 패턴: rankings:{type}:{category}:{limit}
    // 모든 타입과 카테고리 조합 무효화
    const types = ['time', 'donation'];
    const categories = ['all', 'pow-writing', 'pow-music', 'pow-study', 'pow-art', 'pow-reading', 'pow-service'];
    const limits = ['5', '10', '20', '50', '100'];

    const deletePromises: Promise<void>[] = [];

    for (const type of types) {
      for (const category of categories) {
        for (const limit of limits) {
          const key = `rankings:${type}:${category}:${limit}`;
          deletePromises.push(cache.delete(key));
        }
      }
    }

    await Promise.all(deletePromises);
    console.log(`✅ Invalidated ${deletePromises.length} ranking cache keys`);
  } catch (error) {
    console.error('❌ Failed to invalidate ranking cache:', error);
    // 캐시 무효화 실패는 치명적이지 않으므로 에러를 던지지 않음
  }
}

/**
 * 특정 분야 랭킹 캐시만 무효화
 */
export async function invalidateRankingsCacheByCategory(
  cache: KVNamespace,
  donationMode: string
): Promise<void> {
  try {
    const types = ['time', 'donation'];
    const limits = ['5', '10', '20', '50', '100'];

    const deletePromises: Promise<void>[] = [];

    for (const type of types) {
      // 해당 분야 + 'all' 카테고리 무효화
      for (const limit of limits) {
        deletePromises.push(cache.delete(`rankings:${type}:${donationMode}:${limit}`));
        deletePromises.push(cache.delete(`rankings:${type}:all:${limit}`));
      }
    }

    await Promise.all(deletePromises);
    console.log(`✅ Invalidated ranking cache for category: ${donationMode}`);
  } catch (error) {
    console.error('❌ Failed to invalidate ranking cache:', error);
  }
}
