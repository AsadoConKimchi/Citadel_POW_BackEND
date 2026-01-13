-- ============================================
-- Ranking RPC Functions - Version 2 (완전 수정)
-- Created: 2026-01-11
-- Fixed: VARCHAR 타입을 RETURNS TABLE에 맞춤
-- ============================================

-- Drop existing functions
DROP FUNCTION IF EXISTS get_pow_time_rankings(TEXT, INT);
DROP FUNCTION IF EXISTS get_donation_rankings(TEXT, INT);

-- ============================================
-- Function 1: POW Time Rankings
-- ============================================
CREATE OR REPLACE FUNCTION get_pow_time_rankings(
  p_category TEXT DEFAULT 'all',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  rank BIGINT,
  discord_id VARCHAR(255),
  discord_username VARCHAR(255),
  discord_avatar VARCHAR(255),
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
      SUM(COALESCE(s.duration_seconds, s.duration_minutes * 60, 0)) AS total_seconds,
      COUNT(*) AS session_count,
      MAX(s.created_at) AS last_activity_at
    FROM study_sessions s
    INNER JOIN users u ON s.user_id = u.id
    WHERE
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
-- Function 2: Donation Rankings
-- ============================================
CREATE OR REPLACE FUNCTION get_donation_rankings(
  p_category TEXT DEFAULT 'all',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  rank BIGINT,
  discord_id VARCHAR(255),
  discord_username VARCHAR(255),
  discord_avatar VARCHAR(255),
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
-- Grant Permissions
-- ============================================
GRANT EXECUTE ON FUNCTION get_pow_time_rankings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_donation_rankings TO anon, authenticated;
