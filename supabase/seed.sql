-- Sample data for testing

-- Insert sample users
INSERT INTO users (discord_id, discord_username, discord_avatar) VALUES
  ('123456789', 'user1', 'https://cdn.discordapp.com/avatars/123456789/avatar1.png'),
  ('987654321', 'user2', 'https://cdn.discordapp.com/avatars/987654321/avatar2.png'),
  ('456789123', 'user3', 'https://cdn.discordapp.com/avatars/456789123/avatar3.png');

-- Insert sample rankings
INSERT INTO rankings (user_id, pow_score, week_number, year)
SELECT
  u.id,
  FLOOR(RANDOM() * 1000 + 100)::INTEGER,
  EXTRACT(WEEK FROM NOW())::INTEGER,
  EXTRACT(YEAR FROM NOW())::INTEGER
FROM users u;

-- Update ranks
SELECT update_rankings();

-- Insert sample donations
INSERT INTO donations (user_id, amount, currency, message, transaction_id, status)
SELECT
  u.id,
  ROUND((RANDOM() * 100 + 10)::NUMERIC, 2),
  'USD',
  'Thanks for the great work!',
  'txn_' || gen_random_uuid(),
  'completed'
FROM users u;

-- Insert sample discord posts
INSERT INTO discord_posts (user_id, discord_message_id, channel_id, content)
SELECT
  u.id,
  'msg_' || gen_random_uuid(),
  'channel_123',
  'This is a sample post from ' || u.discord_username
FROM users u;

-- Insert sample reactions
INSERT INTO post_reactions (post_id, reaction_count, comment_count)
SELECT
  dp.id,
  FLOOR(RANDOM() * 50)::INTEGER,
  FLOOR(RANDOM() * 20)::INTEGER
FROM discord_posts dp;
