// cosmos.js — CosmosClient singleton, container handles, and the shared
// primitives every repo call is built from. ES modules, Node 22.
//
// WHY A SINGLETON: on Consumption, each warm worker process serves many
// invocations. A CosmosClient carries the connection pool, the TLS session and
// the partition-key-range cache; constructing one per request re-pays the
// handshake and the metadata lookups every single time — real latency, real
// RU. So: build it lazily on first use, then reuse it for the life of the
// process. Never construct a CosmosClient inside a request handler.
//
// R5 / DIAGNOSTICS: diagnosticLevel is pinned to 'info' — the level that emits
// no request/response payloads. Do NOT raise it to 'debug' and do NOT set
// AZURE_LOG_LEVEL=verbose in App Settings: both cause the SDK to log request
// bodies, and our request bodies contain PII ciphertext and subject ids.
//
// Errors thrown from here are sanitised: `cosmos_<op>_failed: status <n>`. The
// original SDK error is attached as `.cause` for debugging. That is safe by
// construction because of a rule this layer keeps and you must keep too:
//
//   NO REPO QUERY EVER TAKES A PII PARAMETER.
//
// Query parameters in this codebase are only: UUID ids, salted hashes, ISO
// timestamps and broker ids. Ciphertext and plaintext are written in document
// bodies, never in a WHERE clause — so even a fully verbose SDK error cannot
// contain personal data.

import { CosmosClient } from '@azure/cosmos';
import { config } from './config.js';

/** Container ids. The deploy script creates these; nothing here creates them. */
export const CONTAINERS = Object.freeze({
  sessions: 'sessions',   // pk /pk   — KV replacement, TTL-swept
  subjects: 'subjects',   // pk /id
  sweeps: 'sweeps',       // pk /subjectId
  findings: 'findings',   // pk /subjectId
  demands: 'demands',     // pk /subjectId
  evidence: 'evidence',   // pk /subjectId
});

let client = null;
const containerCache = new Map();

/** Lazily built, then reused for the life of the process. */
export function getClient() {
  if (client) return client;
  // config.js already threw at import time if any of these were missing; this
  // guard exists so a future refactor that loosens config.js cannot silently
  // produce a client pointed at nothing.
  if (!config.COSMOS_ENDPOINT || !config.COSMOS_KEY || !config.COSMOS_DB) {
    throw new Error(
      'server_misconfigured: COSMOS_ENDPOINT, COSMOS_KEY and COSMOS_DB must all be set',
    );
  }
  client = new CosmosClient({
    endpoint: config.COSMOS_ENDPOINT,
    key: config.COSMOS_KEY,
    // 'info' emits no payloads. See the R5 note above.
    diagnosticLevel: 'info',
    userAgentSuffix: 'consent-archaeology',
    connectionPolicy: {
      requestTimeout: 15000,
      retryOptions: { maxRetryAttemptCount: 5, maxWaitTimeInSeconds: 20 },
    },
  });
  return client;
}

/**
 * Container handle for one of CONTAINERS. Handles are client-side objects —
 * no network call — but caching them avoids re-walking database()/container()
 * on every operation.
 */
export function container(name) {
  const id = CONTAINERS[name];
  if (!id) throw new Error(`unknown_container: ${String(name)}`);
  let handle = containerCache.get(id);
  if (!handle) {
    handle = getClient().database(config.COSMOS_DB).container(id);
    containerCache.set(id, handle);
  }
  return handle;
}

/** Test/rotation hook: drop the cached client so the next call rebuilds it. */
export function resetClient() {
  client = null;
  containerCache.clear();
}

// ---------------------------------------------------------------------------
// error handling
// ---------------------------------------------------------------------------

/** HTTP status from a Cosmos SDK error, or 0 for network/unknown failures. */
export function cosmosStatus(err) {
  if (!err) return 0;
  if (typeof err.code === 'number') return err.code;
  if (typeof err.statusCode === 'number') return err.statusCode;
  if (typeof err.code === 'string' && /^\d+$/.test(err.code)) return Number(err.code);
  return 0;
}

export const isNotFound = (err) => cosmosStatus(err) === 404;
export const isConflict = (err) => cosmosStatus(err) === 409;
export const isPreconditionFailed = (err) => cosmosStatus(err) === 412;

/**
 * Unique-constraint / duplicate-id violation.
 *
 * Replaces the Worker's `/UNIQUE/i.test(err.message)` check on D1. The evidence
 * route's seq retry loop depends on being able to recognise this, so it is a
 * named, exported type rather than a string match on a vendor message.
 */
export class RepoConflictError extends Error {
  constructor(message = 'conflict: unique constraint violated') {
    super(message);
    this.name = 'RepoConflictError';
    this.status = 409;
    this.conflict = true;
  }
}

/** Sanitised wrapper — carries a status, never a payload. */
export class CosmosOperationError extends Error {
  constructor(op, status, cause) {
    super(`cosmos_${op}_failed: status ${status || 'network'}`);
    this.name = 'CosmosOperationError';
    this.status = 500;
    this.cosmosStatus = status;
    this.cause = cause;
  }
}

export function wrapCosmosError(err, op) {
  // Never re-wrap our own; never let an SDK message reach the client.
  if (err instanceof RepoConflictError || err instanceof CosmosOperationError) return err;
  return new CosmosOperationError(op, cosmosStatus(err), err);
}

// ---------------------------------------------------------------------------
// primitives — every repo method is built from these four
// ---------------------------------------------------------------------------

/** Cosmos system fields. Stripped from everything we hand back. */
const SYSTEM_FIELDS = new Set(['_rid', '_self', '_etag', '_attachments', '_ts']);

/** Shallow copy without Cosmos bookkeeping, so callers see the contract shape. */
export function clean(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!SYSTEM_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Point read — ~1 RU, the cheapest operation Cosmos offers. Always prefer this
 * over a query when you know the id AND the partition key.
 * @returns the document, or null when absent.
 */
export async function pointRead(handle, id, partitionKey) {
  try {
    const { resource } = await handle.item(id, partitionKey).read();
    return resource ? clean(resource) : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw wrapCosmosError(err, 'read');
  }
}

/**
 * Create a document. Uses create (not upsert) so a duplicate id or a unique-key
 * violation surfaces as a RepoConflictError instead of silently overwriting.
 */
export async function createItem(handle, doc) {
  try {
    const { resource } = await handle.items.create(doc);
    return clean(resource);
  } catch (err) {
    if (isConflict(err)) throw new RepoConflictError();
    throw wrapCosmosError(err, 'create');
  }
}

/**
 * Partial update. One round trip, server-side, no read-modify-write race —
 * this is how the SQL `UPDATE ... SET x = ?` statements are ported.
 *
 * @param {object[]} operations e.g. [{ op: 'set', path: '/lastActivityAt', value: ts }]
 * @param {string=} condition SQL-ish predicate, e.g. 'FROM c WHERE NOT IS_DEFINED(c.purgedAt)'.
 *   ⚠ Patch conditions are NOT parameterised by the SDK. Never interpolate
 *   caller-supplied text into one — build them from literals only.
 * @returns true if the patch applied; false if the document was absent (404) or
 *   the condition did not hold (412). Those two are the direct equivalent of
 *   D1's `result.meta.changes === 0`, which is how the Worker detected
 *   "row missing or purged".
 */
export async function patchItem(handle, id, partitionKey, operations, condition) {
  if (!operations.length) return true;
  try {
    const body = condition ? { condition, operations } : operations;
    await handle.item(id, partitionKey).patch(body);
    return true;
  } catch (err) {
    if (isNotFound(err) || isPreconditionFailed(err)) return false;
    throw wrapCosmosError(err, 'patch');
  }
}

/** Delete a document. Absent is not an error — the desired state is reached. */
export async function deleteItem(handle, id, partitionKey) {
  try {
    await handle.item(id, partitionKey).delete();
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw wrapCosmosError(err, 'delete');
  }
}

/**
 * Run a query. ALWAYS pass partitionKey when you know it: it scopes the query
 * to a single physical partition, which is the difference between a few RU and
 * a fan-out across every partition in the container. The three places in this
 * codebase that legitimately cannot are listed in README.md — do not add a
 * fourth without reading it.
 *
 * @param {string|object} query string or { query, parameters }
 * @param {string=} partitionKey pass undefined ONLY for a deliberate fan-out
 */
export async function queryAll(handle, query, partitionKey) {
  const options = partitionKey === undefined ? {} : { partitionKey };
  try {
    // fetchAll() drains continuation tokens internally.
    const { resources } = await handle.items.query(query, options).fetchAll();
    return resources;
  } catch (err) {
    throw wrapCosmosError(err, 'query');
  }
}

/** queryAll for `SELECT VALUE ...` projections — returns the raw scalar array. */
export async function queryValues(handle, query, partitionKey) {
  return queryAll(handle, query, partitionKey);
}

/**
 * Run an async op over a list with bounded concurrency. Used by the
 * delete/null-out sweeps, which touch every document in one partition.
 *
 * Deliberately NOT items.bulk(): bulk's per-operation status array makes it
 * easy to accidentally report success while individual operations failed, and
 * the API has churned across SDK minor versions. Point operations are the most
 * stable surface in the SDK, and a rejection here propagates — no swallowed
 * failures, no optimistic returns.
 */
export async function mapLimit(list, limit, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += limit) {
    out.push(...(await Promise.all(list.slice(i, i + limit).map(fn))));
  }
  return out;
}
