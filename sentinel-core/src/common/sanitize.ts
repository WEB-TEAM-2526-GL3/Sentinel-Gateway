/**
 * Centralised sanitizer for Kong entity names.
 * Lowercase, replace non-alphanumeric with hyphens, collapse hyphens, trim edges.
 */
export function sanitizeKongName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
