// http.js — shared HTTP plumbing. Port of worker/src/http.js.
// ES modules, Node 22. Tiny on purpose.
//
// The one behavioural difference from the Worker: json() returns an Azure
// Functions v4 `HttpResponseInit` (a plain object) instead of a WHATWG
// Response. That is what a v4 handler returns, and building it as a plain
// object keeps this file free of any @azure/functions import — the lib layer
// stays testable with `node --test` and no host.
//
//   worker:  return new Response(JSON.stringify(x), { status, headers })
//   azure:   return { status, headers, body: JSON.stringify(x) }
//
// Body/status/headers are byte-identical, so the frontend sees no difference.

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

/**
 * JSON response, Azure Functions v4 shape.
 * @param {unknown} data serialisable payload
 * @param {number} status HTTP status
 * @param {Record<string,string>} headers extra headers (e.g. content-disposition)
 */
export function json(data, status = 200, headers = {}) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(data),
  };
}

/**
 * Parse a JSON request body. On failure throws a generic 400 that does NOT
 * echo any part of the body back — JSON.parse error messages can quote the
 * input, and the input may contain PII (R5).
 *
 * Works unchanged against an Azure `HttpRequest`: it exposes .text() with the
 * same semantics as the Workers Request.
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
