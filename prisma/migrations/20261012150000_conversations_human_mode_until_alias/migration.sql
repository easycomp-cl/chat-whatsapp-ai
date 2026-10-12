-- Alias botResumeAt as human_mode_until for the dashboard Realtime view.
-- DROP + CREATE: CREATE OR REPLACE cannot add a column in the middle of a view.
DROP VIEW IF EXISTS public.conversations;

CREATE VIEW public.conversations AS
SELECT
  id,
  "tenantId" AS business_id,
  "customerId" AS customer_id,
  channel,
  "channelPhoneNumber" AS channel_phone_number,
  status,
  mode,
  "assignedAdminId" AS assigned_admin_id,
  "handoffReason" AS handoff_reason,
  "botResumeAt" AS bot_resume_at,
  CASE
    WHEN mode::text = 'BOT' THEN NULL
    ELSE "botResumeAt"
  END AS human_mode_until,
  "lastMessageAt" AS last_message_at,
  "chatClearedAt" AS chat_cleared_at,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at
FROM public."Conversation";
