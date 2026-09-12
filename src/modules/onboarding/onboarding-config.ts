import { env } from "../../config/env.js";

/**
 * When false (default in development/test):
 * - New businesses start with bot enabled
 * - bot_global_enabled=false does not block the runtime pipeline
 * - setup-status reports can_go_live=true (UI can skip the wizard)
 *
 * Set ONBOARDING_REQUIRED=true to enforce the gate locally.
 * In production, onboarding is required unless ONBOARDING_REQUIRED=false.
 */
export function isOnboardingRequired(): boolean {
  const explicit = process.env.ONBOARDING_REQUIRED?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  return env.NODE_ENV === "production";
}

export function isBotRuntimeBlocked(botGlobalEnabled: boolean): boolean {
  return isOnboardingRequired() && !botGlobalEnabled;
}
