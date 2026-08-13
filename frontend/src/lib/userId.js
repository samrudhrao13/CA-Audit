// Must match backend/src/lib/userId.js's AUTH_EMAIL_DOMAIN.
const AUTH_EMAIL_DOMAIN = "login.internal";

export function syntheticEmailFor(userId) {
  return `${userId.trim()}@${AUTH_EMAIL_DOMAIN}`;
}
