/**
 * Converts a string to a URL-friendly slug
 * - Lowercases the string
 * - Replaces spaces with hyphens
 * - Removes special characters (keeps only alphanumeric and hyphens)
 * - Removes leading/trailing hyphens
 * - Collapses multiple consecutive hyphens into one
 */
export function slugify(text: string): string {
  if (!text) return ""
  
  return text
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, "-")
    // Remove all characters except alphanumeric and hyphens
    .replace(/[^a-z0-9-]/g, "")
    // Remove consecutive hyphens
    .replace(/-+/g, "-")
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, "")
    // Limit length to 100 characters (reasonable for URLs)
    .slice(0, 100)
}

/**
 * Generates a unique slug by appending a random 3-digit number if needed
 * This should be called after checking for collisions in the database
 */
export function generateUniqueSlug(baseSlug: string): string {
  if (!baseSlug) return ""
  
  // Generate a random 3-digit number (100-999)
  const randomSuffix = Math.floor(Math.random() * 900) + 100
  return `${baseSlug}-${randomSuffix}`
}

