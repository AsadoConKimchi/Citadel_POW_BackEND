-- ============================================
-- 하이브리드 적립액 시스템
-- ============================================
-- 목적: 빠른 조회 (메인 테이블) + 완벽한 이력 추적 (로그 테이블)
-- 작성일: 2026-01-11

-- ============================================
-- 1. 메인 테이블: 사용자별 현재 적립액 (빠른 조회)
-- ============================================
CREATE TABLE IF NOT EXISTS user_accumulated_sats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  accumulated_sats INTEGER NOT NULL DEFAULT 0 CHECK (accumulated_sats >= 0),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_accumulated_sats_user_id ON user_accumulated_sats(user_id);

-- ============================================
-- 2. 로그 테이블: 적립/차감 이력 (완벽한 추적)
-- ============================================
CREATE TABLE IF NOT EXISTS accumulated_sats_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 금액 변경 정보
  amount_before INTEGER NOT NULL,
  amount_after INTEGER NOT NULL,
  change_amount INTEGER NOT NULL, -- 양수: 적립, 음수: 차감

  -- 행동 타입
  action VARCHAR(20) NOT NULL CHECK (action IN ('add', 'deduct')),

  -- 연관 정보
  session_id UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
  donation_id UUID REFERENCES donations(id) ON DELETE SET NULL,

  -- 메타데이터
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_accumulated_sats_logs_user_id ON accumulated_sats_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_accumulated_sats_logs_created_at ON accumulated_sats_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accumulated_sats_logs_action ON accumulated_sats_logs(action);

-- ============================================
-- 3. RPC 함수: 적립액 추가 (트랜잭션 보장)
-- ============================================
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

  -- 3. 로그 삽입
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
-- 4. RPC 함수: 적립액 차감 (트랜잭션 보장)
-- ============================================
CREATE OR REPLACE FUNCTION deduct_accumulated_sats(
  p_user_id UUID,
  p_amount INTEGER,
  p_donation_id UUID DEFAULT NULL,
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

  -- 1. 현재 적립액 조회 (FOR UPDATE = Row Lock)
  SELECT user_accumulated_sats.accumulated_sats INTO v_before
  FROM user_accumulated_sats
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 2. 적립액 부족 체크
  IF v_before IS NULL OR v_before < p_amount THEN
    RAISE EXCEPTION 'Insufficient accumulated sats. Current: %, Requested: %', COALESCE(v_before, 0), p_amount;
  END IF;

  -- 3. 적립액 차감
  v_after := v_before - p_amount;

  UPDATE user_accumulated_sats
  SET accumulated_sats = v_after, last_updated = NOW()
  WHERE user_id = p_user_id;

  -- 4. 로그 삽입 (change_amount는 음수)
  INSERT INTO accumulated_sats_logs (
    user_id, amount_before, amount_after, change_amount, action, donation_id, note
  ) VALUES (
    p_user_id, v_before, v_after, -p_amount, 'deduct', p_donation_id, p_note
  );

  -- 5. 결과 반환
  RETURN QUERY SELECT v_after, v_before, v_after;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. RPC 함수: 적립액 조회 (헬퍼)
-- ============================================
CREATE OR REPLACE FUNCTION get_accumulated_sats(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_accumulated INTEGER;
BEGIN
  SELECT accumulated_sats INTO v_accumulated
  FROM user_accumulated_sats
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_accumulated, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 6. 데이터 검증 함수 (무결성 체크)
-- ============================================
CREATE OR REPLACE FUNCTION validate_accumulated_sats()
RETURNS TABLE (
  user_id UUID,
  main_table_sats INTEGER,
  calculated_from_logs INTEGER,
  is_valid BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.user_id,
    m.accumulated_sats AS main_table_sats,
    COALESCE(l.calculated_sats, 0) AS calculated_from_logs,
    (m.accumulated_sats = COALESCE(l.calculated_sats, 0)) AS is_valid
  FROM user_accumulated_sats m
  LEFT JOIN (
    SELECT
      user_id,
      SUM(change_amount) AS calculated_sats
    FROM accumulated_sats_logs
    GROUP BY user_id
  ) l ON m.user_id = l.user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 7. 코멘트 (문서화)
-- ============================================
COMMENT ON TABLE user_accumulated_sats IS '사용자별 현재 적립액 (빠른 조회용)';
COMMENT ON TABLE accumulated_sats_logs IS '적립/차감 이력 (완벽한 추적 및 감사용)';
COMMENT ON FUNCTION add_accumulated_sats IS '적립액 추가 (트랜잭션 보장, 동시성 제어)';
COMMENT ON FUNCTION deduct_accumulated_sats IS '적립액 차감 (트랜잭션 보장, 잔액 부족 체크)';
COMMENT ON FUNCTION get_accumulated_sats IS '적립액 조회 (헬퍼 함수)';
COMMENT ON FUNCTION validate_accumulated_sats IS '데이터 무결성 검증 (메인 테이블 vs 로그 합계)';
