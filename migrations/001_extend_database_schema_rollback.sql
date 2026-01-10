-- ============================================
-- Citadel POW 데이터베이스 스키마 확장 롤백
-- Migration Rollback: 001_extend_database_schema
-- Date: 2026-01-10
-- 주의: 이 스크립트는 데이터 손실을 발생시킬 수 있습니다!
-- ============================================

-- ============================================
-- 1. study_sessions 테이블 롤백
-- ============================================

-- 외래 키 제약조건 제거
ALTER TABLE study_sessions
DROP CONSTRAINT IF EXISTS fk_study_sessions_donation_id;

-- 제약조건 제거
ALTER TABLE study_sessions
DROP CONSTRAINT IF EXISTS chk_study_sessions_achievement_rate;

ALTER TABLE study_sessions
DROP CONSTRAINT IF EXISTS chk_study_sessions_goal_minutes;

-- 인덱스 제거
DROP INDEX IF EXISTS idx_study_sessions_donation_mode;
DROP INDEX IF EXISTS idx_study_sessions_donation_id;
DROP INDEX IF EXISTS idx_study_sessions_achievement_rate;

-- 추가된 컬럼 제거
ALTER TABLE study_sessions
DROP COLUMN IF EXISTS donation_id;

ALTER TABLE study_sessions
DROP COLUMN IF EXISTS achievement_rate;

ALTER TABLE study_sessions
DROP COLUMN IF EXISTS goal_minutes;

ALTER TABLE study_sessions
DROP COLUMN IF EXISTS donation_mode;

-- plan_text를 다시 nullable로 변경
ALTER TABLE study_sessions
ALTER COLUMN plan_text DROP NOT NULL;

ALTER TABLE study_sessions
ALTER COLUMN plan_text DROP DEFAULT;

-- ============================================
-- 2. donations 테이블 롤백
-- ============================================

-- 제약조건 제거
ALTER TABLE donations
DROP CONSTRAINT IF EXISTS chk_donations_achievement_rate;

ALTER TABLE donations
DROP CONSTRAINT IF EXISTS chk_donations_goal_minutes;

-- 인덱스 제거
DROP INDEX IF EXISTS idx_donations_donation_mode;
DROP INDEX IF EXISTS idx_donations_donation_scope;
DROP INDEX IF EXISTS idx_donations_total_donated_sats;

-- 추가된 컬럼 제거
ALTER TABLE donations
DROP COLUMN IF EXISTS total_donated_sats;

ALTER TABLE donations
DROP COLUMN IF EXISTS total_accumulated_sats;

ALTER TABLE donations
DROP COLUMN IF EXISTS accumulated_sats;

ALTER TABLE donations
DROP COLUMN IF EXISTS photo_url;

ALTER TABLE donations
DROP COLUMN IF EXISTS achievement_rate;

ALTER TABLE donations
DROP COLUMN IF EXISTS goal_minutes;

ALTER TABLE donations
DROP COLUMN IF EXISTS plan_text;

-- donation_mode, donation_scope를 다시 nullable로 변경
ALTER TABLE donations
ALTER COLUMN donation_mode DROP NOT NULL;

ALTER TABLE donations
ALTER COLUMN donation_scope DROP NOT NULL;

-- ============================================
-- 완료 메시지
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '⚠️  롤백 완료: 데이터베이스 스키마가 이전 상태로 복원되었습니다';
  RAISE NOTICE '⚠️  주의: 새로 추가된 컬럼의 데이터가 모두 삭제되었습니다';
END $$;
