-- Migration: Add Telegram notification fields to profiles
-- Allows users to link their Telegram account for receiving task alerts.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT true;

-- Prevent two HostFlow users from linking the same Telegram account
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id
  ON profiles (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
