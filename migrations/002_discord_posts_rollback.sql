-- ============================================
-- Citadel POW Discord 반응 수집 테이블 롤백
-- Migration Rollback: 002_discord_posts
-- Date: 2026-01-10
-- 주의: 이 스크립트는 데이터 손실을 발생시킬 수 있습니다!
-- ============================================

-- ============================================
-- 1. 뷰 삭제
-- ============================================

DROP VIEW IF EXISTS popular_posts;

-- ============================================
-- 2. study_sessions 테이블 롤백
-- ============================================

-- 인덱스 제거
DROP INDEX IF EXISTS idx_study_sessions_discord_message_id;
DROP INDEX IF EXISTS idx_study_sessions_reaction_count;

-- 추가된 컬럼 제거
ALTER TABLE study_sessions
DROP COLUMN IF EXISTS discord_message_id;

ALTER TABLE study_sessions
DROP COLUMN IF EXISTS reaction_count;

-- ============================================
-- 3. discord_posts 테이블 삭제
-- ============================================

-- 인덱스 제거 (테이블 삭제 시 자동 삭제되지만 명시적으로 작성)
DROP INDEX IF EXISTS idx_discord_posts_created_at;
DROP INDEX IF EXISTS idx_discord_posts_donation_mode;
DROP INDEX IF EXISTS idx_discord_posts_reaction_count;
DROP INDEX IF EXISTS idx_discord_posts_user_id;
DROP INDEX IF EXISTS idx_discord_posts_message_id;

-- 테이블 삭제
DROP TABLE IF EXISTS discord_posts;

-- ============================================
-- 완료 메시지
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '⚠️  롤백 완료: discord_posts 테이블 및 관련 데이터 삭제';
  RAISE NOTICE '⚠️  주의: Discord 반응 수 데이터가 모두 삭제되었습니다';
END $$;
