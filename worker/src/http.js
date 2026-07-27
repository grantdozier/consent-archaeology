// Shared HTTP plumbing. Tiny on purpose — zero runtime dependencies.

export class HttpError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} message SAFE, PII-free message — this string goes over the
   *   wire in the error response and may be logged. Never interpolate a name,
   *   email, address, phone, narrative, or scraped content into it (R5).
   */
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/**
 * Parse a JSON request body. On failure throws a generic 400 that does NOT
 * echo any part of the body back — JSON.parse error messages can quote the
 * input, and the input may contain PII (R5).
 */
export async function readJson(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, 'unreadable_body');
  }
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object') {
      throw new Error('not_an_object');
    }
    return value;
  } catch {
    throw new HttpError(400, 'invalid_json: request body must be a JSON object');
  }
}

export function nowISO() {
  return new Date().toISOString();
}
