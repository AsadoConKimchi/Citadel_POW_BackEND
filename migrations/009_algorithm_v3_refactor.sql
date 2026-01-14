-- ============================================
-- Algorithm v3 Refactor
-- Migration: 009_algorithm_v3_refactor
-- Date: 2026-01-15
-- ============================================
--
-- 핵심 변경사항:
-- 1. donations 테이블: paid_at, discord_shared 필드 추가
-- 2. accumulated_sats_logs: PARTIAL UNIQUE index (중복 적립 방지)
-- 3. deduct_accumulated_sats: expected_balance 파라미터 (낙관적 잠금)
-- 4. study_sessions: duration_seconds, goal_seconds 필드 추가
--
-- 런타임 계산 (저장 안함):
-- - achievement_rate = FLOOR(duration_seconds / goal_seconds * 100)
-- - total_donated_sats = SUM(amount) FROM donations WHERE status='completed'
-- ============================================

-- ============================================
-- 1. study_sessions 테이블 확장
-- ============================================

-- duration_seconds 추가 (기존에 없으면)
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0;

-- goal_seconds 추가
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS goal_seconds INTEGER DEFAULT 0;

-- 기존 데이터 마이그레이션: duration_minutes → duration_seconds
UPDATE study_sessions
SET duration_seconds = duration_minutes * 60
WHERE duration_seconds = 0 AND duration_minutes > 0;

-- 기존 데이터 마이그레이션: goal_minutes → goal_seconds
UPDATE study_sessions
SET goal_seconds = goal_minutes * 60
WHERE goal_seconds = 0 AND goal_minutes > 0;

-- ============================================
-- 2. donations 테이블 확장
-- ============================================

-- paid_at: 결제 성공 시점 (pending→paid 전환 시)
ALTER TABLE donations
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

-- discord_shared: Discord 공유 성공 여부
ALTER TABLE donations
ADD COLUMN IF NOT EXISTS discord_shared BOOLEAN DEFAULT FALSE;

-- status 필드 CHECK 제약조건 업데이트 (3단계: pending, paid, completed)
-- 기존 제약조건 제거 후 새로 추가
DO $$
BEGIN
  -- 기존 제약조건이 있으면 제거
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'donations_status_check'
    AND table_name = 'donations'
  ) THEN
    ALTER TABLE donations DROP CONSTRAINT donations_status_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- 제약조건이 없으면 무시
  NULL;
END $$;

-- 새 CHECK 제약조건 추가 (기존 'completed' 값 호환)
ALTER TABLE donations
ADD CONSTRAINT donations_status_check
CHECK (status IN ('pending', 'paid', 'completed', 'failed', 'cancelled'));

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_donations_paid_at ON donations(paid_at);
CREATE INDEX IF NOT EXISTS idx_donations_discord_shared ON donations(discord_shared);

-- ============================================
-- 3. accumulated_sats_logs PARTIAL UNIQUE INDEX
-- ============================================
-- 목적: 동일 세션에 대한 중복 적립 방지 (더블클릭 등)
-- session_id가 NOT NULL이고 action='add'인 경우에만 유니크

CREATE UNIQUE INDEX IF NOT EXISTS idx_accumulated_sats_logs_session_unique
ON accumulated_sats_logs (user_id, session_id)
WHERE session_id IS NOT NULL AND action = 'add';

-- ============================================
-- 4. RPC 함수: add_accumulated_sats (업데이트)
-- ============================================
-- 변경: 중복 적립 시 에러 발생 (PARTIAL UNIQUE 활용)

CREATE OR REPLACE FUNCTION add_accumulated_sats(
  p_user_id UUID,
  p_amount INTEGER,
  p_session_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  accumulated_sats INTEGER,
  amount_before INTEGER,
  amount_after INTEGER
) AS $$
DECLARE
  v_before INTEGER;
  v_after INTEGER;
BEGIN
  -- 입력 검증
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- 1. 현재 적립액 조회 (FOR UPDATE = Row Lock으로 동시성 제어)
  SELECT user_accumulated_sats.accumulated_sats INTO v_before
  FROM user_accumulated_sats
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 2-1. 사용자 첫 적립 (레코드 없음)
  IF v_before IS NULL THEN
    v_before := 0;
    v_after := p_amount;

    INSERT INTO user_accumulated_sats (user_id, accumulated_sats, last_updated)
    VALUES (p_user_id, v_after, NOW());
  ELSE
    -- 2-2. 기존 적립액에 추가
    v_after := v_before + p_amount;

    UPDATE user_accumulated_sats
    SET accumulated_sats = v_after, last_updated = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- 3. 로그 삽입 (PARTIAL UNIQUE 제약조건으로 중복 방지)
  -- 중복 시 unique_violation 에러 발생
  INSERT INTO accumulated_sats_logs (
    user_id, amount_before, amount_after, change_amount, action, session_id, note
  ) VALUES (
    p_user_id, v_before, v_after, p_amount, 'add', p_session_id, p_note
  );

  -- 4. 결과 반환
  RETURN QUERY SELECT v_after, v_before, v_after;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. RPC 함수: deduct_accumulated_sats (업데이트)
-- ============================================
-- 변경: expected_balance 파라미터 추가 (낙관적 잠금)

CREATE OR REPLACE FUNCTION deduct_accumulated_sats(
  p_user_id UUID,
  p_amount INTEGER,
  p_donation_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_expected_balance INTEGER DEFAULT NULL  -- 낙관적 잠금용 (선택사항)
)
RETURNS TABLE (
  accumulated_sats INTEGER,
  amount_before INTEGER,
  amount_after INTEGER
) AS $$
DECLARE
  v_before INTEGER;
  v_after INTEGER;
BEGIN
  -- 입력 검증
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- 1. 현재 적립액 조회 (FOR UPDATE = Row Lock)
  SELECT user_accumulated_sats.accumulated_sats INTO v_before
  FROM user_accumulated_sats
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 2. 적립액 부족 체크
  IF v_before IS NULL OR v_before < p_amount THEN
    RAISE EXCEPTION 'Insufficient accumulated sats. Current: %, Requested: %', COALESCE(v_before, 0), p_amount;
  END IF;

  -- 3. 낙관적 잠금 체크 (expected_balance가 제공된 경우)
  IF p_expected_balance IS NOT NULL AND v_before != p_expected_balance THEN
    RAISE EXCEPTION 'Balance mismatch. Expected: %, Actual: %. Another transaction may have modified the balance.', p_expected_balance, v_before;
  END IF;

  -- 4. 적립액 차감
  v_after := v_before - p_amount;

  UPDATE user_accumulated_sats
  SET accumulated_sats = v_after, last_updated = NOW()
  WHERE user_id = p_user_id;

  -- 5. 로그 삽입 (change_amount는 음수)
  INSERT INTO accumulated_sats_logs (
    user_id, amount_before, amount_after, change_amount, action, donation_id, note
  ) VALUES (
    p_user_id, v_before, v_after, -p_amount, 'deduct', p_donation_id, p_note
  );

  -- 6. 결과 반환
  RETURN QUERY SELECT v_after, v_before, v_after;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. 뷰 업데이트: user_study_stats (duration_seconds 사용)
-- ============================================

CREATE OR REPLACE VIEW user_study_stats AS
SELECT
  u.discord_username,
  u.discord_avatar,
  u.discord_id,
  COUNT(ss.id) as total_sessions,
  SUM(COALESCE(ss.duration_seconds, ss.duration_minutes * 60, 0)) as total_study_seconds,
  SUM(ss.duration_minutes) as total_study_minutes,
  AVG(ss.duration_minutes) as avg_session_minutes,
  MAX(ss.created_at) as last_study_at
FROM users u
LEFT JOIN study_sessions ss ON u.id = ss.user_id
GROUP BY u.id, u.discord_username, u.discord_avatar, u.discord_id;

-- ============================================
-- 7. 헬퍼 함수: 런타임 달성률 계산
-- ============================================

CREATE OR REPLACE FUNCTION calculate_achievement_rate(
  p_duration_seconds INTEGER,
  p_goal_seconds INTEGER
)
RETURNS INTEGER AS $$
BEGIN
  -- goal_seconds가 0이면 100% 반환 (목표 없음 = 자동 달성)
  IF p_goal_seconds IS NULL OR p_goal_seconds <= 0 THEN
    RETURN 100;
  END IF;

  -- FLOOR(duration / goal * 100) - 캡 없음 (200% 이상 가능)
  RETURN FLOOR((COALESCE(p_duration_seconds, 0)::NUMERIC / p_goal_seconds) * 100)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 8. 헬퍼 함수: 총 기부액 조회 (SUM 계산)
-- ============================================

CREATE OR REPLACE FUNCTION get_total_donated_sats(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM donations
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND currency = 'SAT';

  RETURN v_total;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 9. 코멘트 (문서화)
-- ============================================

COMMENT ON COLUMN donations.paid_at IS '결제 성공 시점 (pending → paid 전환 시)';
COMMENT ON COLUMN donations.discord_shared IS 'Discord 공유 성공 여부';
COMMENT ON COLUMN study_sessions.duration_seconds IS '실제 공부 시간 (초)';
COMMENT ON COLUMN study_sessions.goal_seconds IS '목표 공부 시간 (초)';
COMMENT ON INDEX idx_accumulated_sats_logs_session_unique IS '동일 세션 중복 적립 방지 (PARTIAL UNIQUE)';
COMMENT ON FUNCTION calculate_achievement_rate IS '달성률 런타임 계산 (저장 안함)';
COMMENT ON FUNCTION get_total_donated_sats IS '총 기부액 런타임 계산 (저장 안함)';

-- ============================================
-- 완료 메시지
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Algorithm v3 마이그레이션 완료';
  RAISE NOTICE '============================================';
  RAISE NOTICE '1. study_sessions: duration_seconds, goal_seconds 추가';
  RAISE NOTICE '2. donations: paid_at, discord_shared 추가';
  RAISE NOTICE '3. accumulated_sats_logs: PARTIAL UNIQUE index 추가';
  RAISE NOTICE '4. RPC 함수: expected_balance 낙관적 잠금 추가';
  RAISE NOTICE '5. 헬퍼 함수: calculate_achievement_rate, get_total_donated_sats';
  RAISE NOTICE '============================================';
END $$;
