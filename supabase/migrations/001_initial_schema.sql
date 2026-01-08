-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users 테이블
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discord_id VARCHAR(255) UNIQUE NOT NULL,
  discord_username VARCHAR(255) NOT NULL,
  discord_avatar VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rankings 테이블 (POW 순위 시스템)
CREATE TABLE rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pow_score INTEGER DEFAULT 0 NOT NULL,
  rank INTEGER,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, week_number, year)
);

-- Donations 테이블
CREATE TABLE donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  message TEXT,
  transaction_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Discord Posts 테이블
CREATE TABLE discord_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  discord_message_id VARCHAR(255) UNIQUE NOT NULL,
  channel_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Post Reactions 테이블
CREATE TABLE post_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES discord_posts(id) ON DELETE CASCADE,
  reaction_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  total_engagement INTEGER GENERATED ALWAYS AS (reaction_count + comment_count) STORED,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_rankings_user_id ON rankings(user_id);
CREATE INDEX idx_rankings_week_year ON rankings(week_number, year);
CREATE INDEX idx_rankings_score ON rankings(pow_score DESC);
CREATE INDEX idx_donations_user_id ON donations(user_id);
CREATE INDEX idx_donations_created_at ON donations(created_at DESC);
CREATE INDEX idx_discord_posts_user_id ON discord_posts(user_id);
CREATE INDEX idx_post_reactions_engagement ON post_reactions(total_engagement DESC);

-- View for leaderboard
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  u.discord_username,
  u.discord_avatar,
  r.pow_score,
  r.rank,
  r.week_number,
  r.year,
  r.updated_at
FROM rankings r
JOIN users u ON r.user_id = u.id
ORDER BY r.pow_score DESC;

-- View for top donors
CREATE OR REPLACE VIEW top_donors AS
SELECT
  u.discord_username,
  u.discord_avatar,
  SUM(d.amount) as total_donated,
  COUNT(d.id) as donation_count,
  MAX(d.created_at) as last_donation_at
FROM donations d
JOIN users u ON d.user_id = u.id
WHERE d.status = 'completed'
GROUP BY u.id, u.discord_username, u.discord_avatar
ORDER BY total_donated DESC;

-- View for top posts
CREATE OR REPLACE VIEW top_discord_posts AS
SELECT
  dp.id,
  dp.content,
  dp.discord_message_id,
  dp.channel_id,
  u.discord_username,
  u.discord_avatar,
  pr.reaction_count,
  pr.comment_count,
  pr.total_engagement,
  dp.created_at
FROM discord_posts dp
JOIN users u ON dp.user_id = u.id
LEFT JOIN post_reactions pr ON dp.id = pr.post_id
ORDER BY pr.total_engagement DESC NULLS LAST;

-- Function to update rankings
CREATE OR REPLACE FUNCTION update_rankings()
RETURNS void AS $$
BEGIN
  UPDATE rankings r1
  SET rank = (
    SELECT COUNT(*) + 1
    FROM rankings r2
    WHERE r2.week_number = r1.week_number
    AND r2.year = r1.year
    AND r2.pow_score > r1.pow_score
  )
  WHERE r1.week_number = EXTRACT(WEEK FROM NOW())::INTEGER
  AND r1.year = EXTRACT(YEAR FROM NOW())::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rankings_updated_at BEFORE UPDATE ON rankings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_reactions_updated_at BEFORE UPDATE ON post_reactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
