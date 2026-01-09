-- Accumulated Sats 테이블 추가
-- 사용자의 일별 적립 사토시를 저장
CREATE TABLE accumulated_sats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  total_sats INTEGER NOT NULL DEFAULT 0,
  plan_text TEXT,
  goal_minutes INTEGER,
  donation_mode VARCHAR(50) NOT NULL DEFAULT 'pow-writing',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Indexes for performance
CREATE INDEX idx_accumulated_sats_user_id ON accumulated_sats(user_id);
CREATE INDEX idx_accumulated_sats_date ON accumulated_sats(date DESC);
CREATE INDEX idx_accumulated_sats_user_date ON accumulated_sats(user_id, date);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_accumulated_sats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER accumulated_sats_update_timestamp
  BEFORE UPDATE ON accumulated_sats
  FOR EACH ROW EXECUTE FUNCTION update_accumulated_sats_updated_at();
