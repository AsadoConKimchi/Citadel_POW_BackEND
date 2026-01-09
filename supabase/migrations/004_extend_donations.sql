-- Donations 테이블 확장
-- 프론트엔드에서 사용하는 상세 기부 정보를 저장하기 위한 필드 추가

-- 기존 컬럼 타입 변경 (amount를 INTEGER로 변경 - sats는 정수)
ALTER TABLE donations
  ALTER COLUMN amount TYPE INTEGER USING amount::INTEGER;

-- currency 기본값을 SAT로 변경
ALTER TABLE donations
  ALTER COLUMN currency SET DEFAULT 'SAT';

-- 새로운 컬럼 추가
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS donation_mode VARCHAR(50) DEFAULT 'pow-writing',
  ADD COLUMN IF NOT EXISTS donation_scope VARCHAR(50) DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS note TEXT;

-- message 필드를 note로 통합하기 위해 기존 데이터 마이그레이션
UPDATE donations SET note = message WHERE note IS NULL AND message IS NOT NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(date DESC);
CREATE INDEX IF NOT EXISTS idx_donations_user_date ON donations(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_donations_scope ON donations(donation_scope);

-- View 업데이트 (top_donors는 SAT 기준으로 표시)
CREATE OR REPLACE VIEW top_donors AS
SELECT
  u.discord_username,
  u.discord_avatar,
  SUM(d.amount) as total_donated,
  COUNT(d.id) as donation_count,
  MAX(d.created_at) as last_donation_at
FROM donations d
JOIN users u ON d.user_id = u.id
WHERE d.status = 'completed' AND d.currency = 'SAT'
GROUP BY u.id, u.discord_username, u.discord_avatar
ORDER BY total_donated DESC;
