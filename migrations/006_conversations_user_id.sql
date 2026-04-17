-- Add user_id to conversations so history can be filtered per-student
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, chatbot_id, timestamp DESC);
