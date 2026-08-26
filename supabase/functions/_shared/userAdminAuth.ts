/** Return only a non-empty bearer token from an Authorization header. */
export function extractBearerToken(header: string | null): string | null {
  const match = (header || '').match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || null;
}
