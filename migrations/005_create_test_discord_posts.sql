-- ============================================
-- 테스트용 discord_posts 데이터 생성
-- Migration: 005_create_test_discord_posts
-- Date: 2026-01-10
-- ============================================

-- ============================================
-- 1. 기존 study_sessions에서 임의로 인기 게시물 생성
-- ============================================

-- discord_posts 테이블에 임의의 반응 수를 가진 테스트 데이터 삽입
INSERT INTO discord_posts (
  message_id,
  channel_id,
  user_id,
  session_id,
  photo_url,
  plan_text,
  donation_mode,
  reaction_count,
  reactions,
  created_at,
  updated_at
)
SELECT
  'test_' || ss.id AS message_id,
  '1330845896931319949' AS channel_id,
  ss.user_id,
  ss.id,
  ss.photo_url,
  ss.plan_text,
  ss.donation_mode,
  -- 랜덤 반응 수 (0~20)
  FLOOR(RANDOM() * 20)::INTEGER AS reaction_count,
  -- 랜덤 반응 데이터
  jsonb_build_object(
    '👍', FLOOR(RANDOM() * 10)::INTEGER,
    '❤️', FLOOR(RANDOM() * 8)::INTEGER,
    '🔥', FLOOR(RANDOM() * 5)::INTEGER
  ) AS reactions,
  ss.created_at,
  ss.created_at
FROM study_sessions ss
WHERE ss.photo_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM discord_posts dp
    WHERE dp.session_id = ss.id
  )
ORDER BY ss.created_at DESC
LIMIT 20;

-- ============================================
-- 2. 반응 수 업데이트 (reactions JSONB 합계와 일치하도록)
-- ============================================

UPDATE discord_posts dp
SET reaction_count = (
  SELECT SUM(value::INTEGER)
  FROM jsonb_each_text(dp.reactions)
)
WHERE reaction_count = 0 OR reaction_count IS NULL;

-- ============================================
-- 3. 결과 확인
-- ============================================

DO $$
DECLARE
  total_posts INTEGER;
  total_with_reactions INTEGER;
  top_post RECORD;
BEGIN
  SELECT COUNT(*) INTO total_posts FROM discord_posts;
  SELECT COUNT(*) INTO total_with_reactions FROM discord_posts WHERE reaction_count > 0;

  SELECT * INTO top_post
  FROM popular_posts
  ORDER BY reaction_count DESC, created_at DESC
  LIMIT 1;

  RAISE NOTICE '✅ 테스트 데이터 생성 완료';
  RAISE NOTICE '📊 총 discord_posts 수: %', total_posts;
  RAISE NOTICE '📊 반응이 있는 게시물 수: %', total_with_reactions;

  IF top_post.id IS NOT NULL THEN
    RAISE NOTICE '🏆 TOP 1 게시물: % (반응 수: %)', top_post.plan_text, top_post.reaction_count;
  END IF;
END $$;
