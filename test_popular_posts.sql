-- ============================================
-- 인기 게시물 데이터 확인용 쿼리
-- ============================================

-- 1. discord_posts 테이블 확인
SELECT
  COUNT(*) as total_discord_posts,
  COUNT(CASE WHEN reaction_count > 0 THEN 1 END) as posts_with_reactions,
  MAX(reaction_count) as max_reactions
FROM discord_posts;

-- 2. popular_posts 뷰 확인
SELECT
  message_id,
  discord_username,
  plan_text,
  reaction_count,
  duration_seconds,
  duration_minutes,
  created_at
FROM popular_posts
ORDER BY reaction_count DESC, created_at DESC
LIMIT 5;

-- 3. discord_posts 원본 데이터 확인
SELECT
  dp.message_id,
  dp.reaction_count,
  dp.reactions,
  dp.created_at,
  u.discord_username
FROM discord_posts dp
JOIN users u ON dp.user_id = u.id
ORDER BY dp.reaction_count DESC
LIMIT 5;
