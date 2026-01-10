-- ============================================
-- 테스트용 discord_posts 데이터 생성 (photo_url 조건 제거)
-- Migration: 006_create_test_discord_posts_without_photo
-- Date: 2026-01-10
-- ============================================

-- ============================================
-- 1. 기존 study_sessions에서 인기 게시물 생성 (photo_url 없어도 생성)
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
  'test_msg_' || ss.id AS message_id,
  '1330845896931319949' AS channel_id,
  ss.user_id,
  ss.id,
  ss.photo_url,  -- photo_url이 NULL이어도 괜찮음
  ss.plan_text,
  ss.donation_mode,
  -- 랜덤 반응 수 (5~25) - 더 많은 반응 생성
  (5 + FLOOR(RANDOM() * 20))::INTEGER AS reaction_count,
  -- 랜덤 반응 데이터
  jsonb_build_object(
    '👍', (1 + FLOOR(RANDOM() * 12))::INTEGER,
    '❤️', (1 + FLOOR(RANDOM() * 10))::INTEGER,
    '🔥', (1 + FLOOR(RANDOM() * 8))::INTEGER,
    '💪', (FLOOR(RANDOM() * 5))::INTEGER
  ) AS reactions,
  ss.created_at,
  ss.created_at
FROM study_sessions ss
WHERE ss.plan_text IS NOT NULL  -- 계획만 있으면 OK
  AND NOT EXISTS (
    SELECT 1 FROM discord_posts dp
    WHERE dp.session_id = ss.id
  )
ORDER BY ss.created_at DESC
LIMIT 30;  -- 30개 생성

-- ============================================
-- 2. 반응 수 업데이트 (reactions JSONB 합계와 일치하도록)
-- ============================================

UPDATE discord_posts dp
SET reaction_count = (
  SELECT COALESCE(SUM(value::INTEGER), 0)
  FROM jsonb_each_text(dp.reactions)
)
WHERE dp.message_id LIKE 'test_msg_%';

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
    RAISE NOTICE '🏆 TOP 1 게시물: % (반응 수: %)', COALESCE(top_post.plan_text, '계획 없음'), top_post.reaction_count;
    RAISE NOTICE '👤 사용자: %', top_post.discord_username;
  END IF;
END $$;
