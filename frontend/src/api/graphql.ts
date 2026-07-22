import { authenticatedFetch } from '../auth/tokenManager';

/**
 * Sends a GraphQL request to the ICP server.
 * Safely handles non-JSON responses (e.g. HTML error pages on 401/500)
 * by reading the body as text first and parsing cautiously.
 *
 * @param query - The GraphQL query or mutation string
 * @param variables - Optional variables to pass with the query
 * @returns The `data` field from the GraphQL response
 * @throws {Error} If the HTTP request fails or the server returns GraphQL errors
 */
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await authenticatedFetch(window.API_CONFIG.graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(`GraphQL request failed (${res.status} ${res.statusText}): ${text.slice(0, 500)}`);
    }
    throw new Error(`Invalid JSON response from GraphQL endpoint: ${text.slice(0, 500)}`);
  }

  // Check for non-OK HTTP status with truncated preview + GraphQL errors envelope
  if (!res.ok) {
    const preview = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    const message = json?.errors?.[0]?.message ?? json?.message ?? preview;
    throw new Error(`Request failed (${res.status})${message ? `: ${message}` : ''}`);
  }

  // Check for GraphQL-level errors in successful HTTP response
  if (json?.errors && Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message ?? 'GraphQL error occurred');
  }

  // Validate that response contains required data field
  if (!json || !('data' in json)) {
    throw new Error('Invalid GraphQL response: missing "data" field');
  }

  return json.data as T;
}
