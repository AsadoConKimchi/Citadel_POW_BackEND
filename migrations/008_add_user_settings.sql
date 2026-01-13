-- ============================================
-- Phase 6: localStorage → 백엔드 마이그레이션
-- Migration: 008_add_user_settings
-- Date: 2026-01-13
-- ============================================

-- ============================================
-- 1. users 테이블에 donation_scope 추가
-- ============================================

-- donation_scope 컬럼 추가 (기본값: session)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS donation_scope VARCHAR(20) DEFAULT 'session';

-- 기존 데이터에 기본값 설정
UPDATE users
SET donation_scope = 'session'
WHERE donation_scope IS NULL;

-- NOT NULL 제약조건 추가
ALTER TABLE users
ALTER COLUMN donation_scope SET NOT NULL;

-- 제약조건: session 또는 total만 허용
ALTER TABLE users
DROP CONSTRAINT IF EXISTS chk_users_donation_scope;

ALTER TABLE users
ADD CONSTRAINT chk_users_donation_scope
CHECK (donation_scope IN ('session', 'total'));

-- 인덱스 추가 (필터링 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_users_donation_scope ON users(donation_scope);

-- ============================================
-- 완료 메시지
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ 마이그레이션 완료: users 테이블에 donation_scope 추가';
  RAISE NOTICE '📊 기본값: session';
  RAISE NOTICE '🔒 제약조건: session 또는 total만 허용';
END $$;
