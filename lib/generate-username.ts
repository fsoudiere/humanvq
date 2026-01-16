/**
 * Generate a default username for a new user
 * Format: "user-" + first 8 characters of user ID (without hyphens)
 * Example: user-12345678
 */
export function generateDefaultUsername(userId: string): string {
  // Remove hyphens and take first 8 characters
  const cleanId = userId.replace(/-/g, '')
  const shortId = cleanId.substring(0, 8)
  return `user-${shortId}`
}
