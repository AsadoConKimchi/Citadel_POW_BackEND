-- ============================================
-- Ranking RPC Functions for Performance Optimization
-- Created: 2026-01-11
-- Purpose: Replace JavaScript aggregation with DB-side aggregation
-- Expected improvement: 900ms → 50-100ms (10x faster)
-- ============================================

-- ============================================
-- Function 1: POW Time Rankings (분야별 POW 시간 랭킹)
-- ============================================
CREATE OR REPLACE FUNCTION get_pow_time_rankings(
  p_category TEXT DEFAULT 'all',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  rank BIGINT,
  discord_id TEXT,
  discord_username TEXT,
  discord_avatar TEXT,
  total_seconds BIGINT,
  total_minutes NUMERIC,
  session_count BIGINT,
  last_activity_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT
      u.discord_id,
      u.discord_username,
      u.discord_avatar,
      -- duration_seconds 우선, 없으면 duration_minutes * 60
      SUM(COALESCE(s.duration_seconds, s.duration_minutes * 60, 0)) AS total_seconds,
      COUNT(*) AS session_count,
      MAX(s.created_at) AS last_activity_at
    FROM study_sessions s
    INNER JOIN users u ON s.user_id = u.id
    WHERE
      -- 카테고리 필터링 (all이면 모든 카테고리)
      CASE
        WHEN p_category = 'all' THEN TRUE
        ELSE s.donation_mode = p_category
      END
    GROUP BY u.discord_id, u.discord_username, u.discord_avatar
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY us.total_seconds DESC) AS rank,
    us.discord_id,
    us.discord_username,
    us.discord_avatar,
    us.total_seconds,
    ROUND((us.total_seconds::NUMERIC / 60.0), 1) AS total_minutes,
    us.session_count,
    us.last_activity_at
  FROM user_stats us
  ORDER BY us.total_seconds DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Function 2: Donation Rankings (분야별 기부 금액 랭킹)
-- ============================================
CREATE OR REPLACE FUNCTION get_donation_rankings(
  p_category TEXT DEFAULT 'all',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  rank BIGINT,
  discord_id TEXT,
  discord_username TEXT,
  discord_avatar TEXT,
  total_donations BIGINT,
  donation_count BIGINT,
  last_activity_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT
      u.discord_id,
      u.discord_username,
      u.discord_avatar,
      SUM(COALESCE(d.amount_sats, 0)) AS total_donations,
      COUNT(*) AS donation_count,
      MAX(d.created_at) AS last_activity_at
    FROM donations d
    INNER JOIN users u ON d.user_id = u.id
    WHERE
      d.status = 'completed'
      AND
      -- 카테고리 필터링 (all이면 모든 카테고리)
      CASE
        WHEN p_category = 'all' THEN TRUE
        ELSE d.donation_mode = p_category
      END
    GROUP BY u.discord_id, u.discord_username, u.discord_avatar
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY us.total_donations DESC) AS rank,
    us.discord_id,
    us.discord_username,
    us.discord_avatar,
    us.total_donations,
    us.donation_count,
    us.last_activity_at
  FROM user_stats us
  ORDER BY us.total_donations DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Grant Permissions (Supabase anon/authenticated roles)
-- ============================================
GRANT EXECUTE ON FUNCTION get_pow_time_rankings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_donation_rankings TO anon, authenticated;

-- ============================================
-- Test Queries (실행 예시)
-- ============================================
-- POW 시간 랭킹 (전체)
-- SELECT * FROM get_pow_time_rankings('all', 10);

-- POW 시간 랭킹 (글쓰기만)
-- SELECT * FROM get_pow_time_rankings('pow-writing', 10);

-- 기부 금액 랭킹 (전체)
-- SELECT * FROM get_donation_rankings('all', 10);

-- 기부 금액 랭킹 (공부만)
-- SELECT * FROM get_donation_rankings('pow-study', 10);
