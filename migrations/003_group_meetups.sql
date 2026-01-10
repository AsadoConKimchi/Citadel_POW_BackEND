-- Group POW Meet-up 기능을 위한 테이블 생성

-- 1. group_meetups 테이블: Meet-up 정보 저장
CREATE TABLE IF NOT EXISTS group_meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Meet-up 정보
  title VARCHAR(200) NOT NULL,
  description TEXT,
  image_url TEXT,
  donation_mode VARCHAR(50) DEFAULT 'pow-writing',

  -- 일정
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes INTEGER NOT NULL,

  -- 기부 목표
  target_donation_amount INTEGER NOT NULL, -- sats

  -- 상태
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled

  -- QR 코드 (생성 시점에만 저장)
  qr_code_url TEXT,
  qr_code_expires_at TIMESTAMP,

  -- 메타데이터
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_group_meetups_status ON group_meetups(status);
CREATE INDEX IF NOT EXISTS idx_group_meetups_scheduled_at ON group_meetups(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_meetups_organizer_id ON group_meetups(organizer_id);

-- 2. meetup_participants 테이블: 참여자 정보 저장
CREATE TABLE IF NOT EXISTS meetup_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id UUID NOT NULL REFERENCES group_meetups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 참여 정보
  pledged_amount INTEGER NOT NULL, -- 약속한 기부 금액 (sats)
  actual_donated_amount INTEGER DEFAULT 0, -- 실제 기부한 금액

  -- 출석 확인
  attended BOOLEAN DEFAULT false,
  attended_at TIMESTAMP,

  -- 기부 상태
  donation_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, skipped
  donated_at TIMESTAMP,
  donation_id UUID REFERENCES donations(id) ON DELETE SET NULL,

  -- 메타데이터
  joined_at TIMESTAMP DEFAULT now(),

  UNIQUE(meetup_id, user_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_meetup_participants_meetup_id ON meetup_participants(meetup_id);
CREATE INDEX IF NOT EXISTS idx_meetup_participants_user_id ON meetup_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_meetup_participants_donation_status ON meetup_participants(donation_status);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_group_meetups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_group_meetups_updated_at
  BEFORE UPDATE ON group_meetups
  FOR EACH ROW
  EXECUTE FUNCTION update_group_meetups_updated_at();
