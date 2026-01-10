-- ============================================
-- Citadel POW 데이터베이스 스키마 확장
-- Migration: 001_extend_database_schema
-- Date: 2026-01-10
-- ============================================

-- ============================================
-- 1. study_sessions 테이블 확장
-- ============================================

-- POW 분야 추가 (필수)
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS donation_mode VARCHAR(50) DEFAULT 'pow-writing';

-- 기존 데이터에 기본값 설정
UPDATE study_sessions
SET donation_mode = 'pow-writing'
WHERE donation_mode IS NULL;

-- NOT NULL 제약조건 추가
ALTER TABLE study_sessions
ALTER COLUMN donation_mode SET NOT NULL;

-- plan_text를 필수로 변경
ALTER TABLE study_sessions
ALTER COLUMN plan_text SET DEFAULT '';

UPDATE study_sessions
SET plan_text = ''
WHERE plan_text IS NULL;

ALTER TABLE study_sessions
ALTER COLUMN plan_text SET NOT NULL;

-- 목표시간 추가 (필수, 기본값 0)
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS goal_minutes INTEGER DEFAULT 0;

UPDATE study_sessions
SET goal_minutes = 0
WHERE goal_minutes IS NULL;

ALTER TABLE study_sessions
ALTER COLUMN goal_minutes SET NOT NULL;

-- 달성률 추가 (필수, 기본값 0)
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS achievement_rate NUMERIC(5,2) DEFAULT 0;

UPDATE study_sessions
SET achievement_rate = 0
WHERE achievement_rate IS NULL;

ALTER TABLE study_sessions
ALTER COLUMN achievement_rate SET NOT NULL;

-- 기부 연결 ID 추가 (nullable)
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS donation_id UUID;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_study_sessions_donation_mode ON study_sessions(donation_mode);
CREATE INDEX IF NOT EXISTS idx_study_sessions_donation_id ON study_sessions(donation_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_achievement_rate ON study_sessions(achievement_rate);

-- ============================================
-- 2. donations 테이블 확장
-- ============================================

-- POW 정보 스냅샷 필드 추가 (nullable)
ALTER TABLE donations
ADD COLUMN IF NOT EXISTS plan_text TEXT;

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS goal_minutes INTEGER;

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS achievement_rate NUMERIC(5,2);

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 누적 정보 스냅샷 필드 추가 (nullable)
ALTER TABLE donations
ADD COLUMN IF NOT EXISTS accumulated_sats INTEGER;

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS total_accumulated_sats INTEGER;

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS total_donated_sats INTEGER;

-- donation_mode를 필수로 변경
UPDATE donations
SET donation_mode = 'pow-writing'
WHERE donation_mode IS NULL;

ALTER TABLE donations
ALTER COLUMN donation_mode SET NOT NULL;

-- donation_scope를 필수로 변경
UPDATE donations
SET donation_scope = 'session'
WHERE donation_scope IS NULL;

ALTER TABLE donations
ALTER COLUMN donation_scope SET NOT NULL;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_donations_donation_mode ON donations(donation_mode);
CREATE INDEX IF NOT EXISTS idx_donations_donation_scope ON donations(donation_scope);
CREATE INDEX IF NOT EXISTS idx_donations_total_donated_sats ON donations(total_donated_sats);

-- ============================================
-- 3. 외래 키 제약조건 추가 (선택사항)
-- ============================================

-- study_sessions.donation_id -> donations.id
-- 주의: 기존 데이터가 있으면 NULL 값이 있을 수 있으므로 조건부로 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_study_sessions_donation_id'
    AND table_name = 'study_sessions'
  ) THEN
    ALTER TABLE study_sessions
    ADD CONSTRAINT fk_study_sessions_donation_id
    FOREIGN KEY (donation_id)
    REFERENCES donations(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 4. 제약조건 추가
-- ============================================

-- achievement_rate 범위 제약 (0-200%)
ALTER TABLE study_sessions
DROP CONSTRAINT IF EXISTS chk_study_sessions_achievement_rate;

ALTER TABLE study_sessions
ADD CONSTRAINT chk_study_sessions_achievement_rate
CHECK (achievement_rate >= 0 AND achievement_rate <= 200);

ALTER TABLE donations
DROP CONSTRAINT IF EXISTS chk_donations_achievement_rate;

ALTER TABLE donations
ADD CONSTRAINT chk_donations_achievement_rate
CHECK (achievement_rate IS NULL OR (achievement_rate >= 0 AND achievement_rate <= 200));

-- goal_minutes 범위 제약 (0 이상)
ALTER TABLE study_sessions
DROP CONSTRAINT IF EXISTS chk_study_sessions_goal_minutes;

ALTER TABLE study_sessions
ADD CONSTRAINT chk_study_sessions_goal_minutes
CHECK (goal_minutes >= 0);

ALTER TABLE donations
DROP CONSTRAINT IF EXISTS chk_donations_goal_minutes;

ALTER TABLE donations
ADD CONSTRAINT chk_donations_goal_minutes
CHECK (goal_minutes IS NULL OR goal_minutes >= 0);

-- ============================================
-- 5. 기존 데이터 마이그레이션 (선택사항)
-- ============================================

-- 기존 study_sessions의 plan_text에 이모지 추가 (이미 있는 경우 스킵)
UPDATE study_sessions
SET plan_text = CONCAT('📝 ', plan_text)
WHERE plan_text NOT LIKE '%📝%'
  AND plan_text NOT LIKE '%✒️%'
  AND plan_text NOT LIKE '%🎵%'
  AND plan_text NOT LIKE '%🎨%'
  AND plan_text NOT LIKE '%📚%'
  AND plan_text NOT LIKE '%✝️%'
  AND plan_text != '';

-- ============================================
-- 완료 메시지
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ 마이그레이션 완료: study_sessions 및 donations 테이블 확장';
  RAISE NOTICE '📊 study_sessions 추가 컬럼: donation_mode, goal_minutes, achievement_rate, donation_id';
  RAISE NOTICE '📊 donations 추가 컬럼: plan_text, goal_minutes, achievement_rate, photo_url, accumulated_sats, total_accumulated_sats, total_donated_sats';
END $$;
