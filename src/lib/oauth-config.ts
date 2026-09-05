/**
 * Shared OAuth constants.
 *
 * The callback URL is a FIXED string, not derived from
 * process.env.NEXT_PUBLIC_APP_URL (which is "http://localhost:3000" in this
 * environment's own .env.local) — Supabase's Redirect URLs allow-list must
 * contain this exact string, so it needs to stay stable and correct
 * regardless of what a given deployment's env vars happen to be set to.
 * Update here AND in Supabase's dashboard together if the production host
 * ever changes.
 */
export const OAUTH_CALLBACK_URL = "https://smart-shop-ai-ruby.vercel.app/api/auth/oauth/callback";

/** Hard allow-list — Google only in this phase. Azure/Apple are deliberately
 * absent, not just unimplemented, so an unexpected provider value can never
 * reach signInWithOAuth(). */
export const SUPPORTED_OAUTH_PROVIDERS = ["google"] as const;
export type SupportedOAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

export function isSupportedOAuthProvider(value: unknown): value is SupportedOAuthProvider {
  return typeof value === "string" && (SUPPORTED_OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** HttpOnly cookie /oauth/start sets to carry the handoff challenge through
 * to /oauth/callback in the same browser session — see oauth-ticket.ts's
 * doc comment for the full app-instance-binding rationale. */
export const HANDOFF_CHALLENGE_COOKIE = "oauth_handoff_challenge";
