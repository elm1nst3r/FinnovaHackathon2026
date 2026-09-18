import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { isGovernanceMember } from '../core/model.ts';
import type { Identity, ValidationError } from '../core/model.ts';
import { IDENTITY_HEADER, resolveIdentity } from './identity.ts';
import type { GovernanceStore } from './store.ts';

export interface RouteContext {
  identity: Identity;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  now: Date;
  store: GovernanceStore;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export type Handler = (context: RouteContext) => HandlerResult | Promise<HandlerResult>;

/**
 * Authorisation is a property of the route, checked by the router. A new
 * endpoint cannot forget to call a guard, because there is no guard to call —
 * the declaration is the guard.
 */
export type AuthLevel = 'authenticated' | 'governance';

export interface Route {
  method: 'GET' | 'POST';
  pattern: string;
  auth: AuthLevel;
  handler: Handler;
}

const MAX_BODY_BYTES = 256 * 1024;

export function ok(body: unknown): HandlerResult {
  return { status: 200, body };
}

export function created(body: unknown): HandlerResult {
  return { status: 201, body };
}

export function badRequest(errors: ValidationError[]): HandlerResult {
  return { status: 422, body: { errors } };
}

export function notFound(message: string): HandlerResult {
  return { status: 404, body: { errors: [{ code: 'NOT_FOUND', field: '', message }] } };
}

export function forbidden(message: string): HandlerResult {
  return { status: 403, body: { errors: [{ code: 'FORBIDDEN', field: '', message }] } };
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index] as string;
    const actual = pathParts[index] as string;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return undefined;
  return JSON.parse(text) as unknown;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // The cockpit ships no inline script and loads nothing from third parties.
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? null);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

async function serveStatic(
  root: string,
  urlPath: string,
  response: ServerResponse,
): Promise<boolean> {
  const relative = urlPath === '/' ? 'index.html' : normalize(urlPath).replace(/^([/\\])+/, '');
  const target = resolve(root, relative);
  // Containment check before any file system access: everything served must
  // resolve inside the static root, whatever the request path claimed.
  if (target !== root && !target.startsWith(root + sep)) return false;

  try {
    const content = await readFile(target);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': STATIC_TYPES[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': content.length,
    });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

export interface AppOptions {
  routes: Route[];
  store: GovernanceStore;
  staticRoot?: string;
}

export function createApp(options: AppOptions): Server {
  const staticRoot = options.staticRoot ? resolve(options.staticRoot) : null;

  return createServer((request, response) => {
    void handle(request, response, options, staticRoot).catch(() => {
      send(response, 500, { errors: [{ code: 'INTERNAL', field: '', message: 'Unexpected error.' }] });
    });
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: AppOptions,
  staticRoot: string | null,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const method = request.method ?? 'GET';

  if (!url.pathname.startsWith('/api/')) {
    if (method === 'GET' && staticRoot && (await serveStatic(staticRoot, url.pathname, response))) return;
    if (method === 'GET' && staticRoot && (await serveStatic(staticRoot, '/index.html', response))) return;
    send(response, 404, { errors: [{ code: 'NOT_FOUND', field: '', message: 'Not found.' }] });
    return;
  }

  const route = options.routes.find(
    (candidate) => candidate.method === method && matchPattern(candidate.pattern, url.pathname) !== null,
  );
  if (!route) {
    send(response, 404, { errors: [{ code: 'NOT_FOUND', field: '', message: 'Unknown endpoint.' }] });
    return;
  }

  const identity = resolveIdentity(request.headers[IDENTITY_HEADER] as string | undefined);
  if (!identity) {
    send(response, 401, {
      errors: [{ code: 'UNAUTHENTICATED', field: '', message: 'Sign in to continue.' }],
    });
    return;
  }

  if (route.auth === 'governance' && !isGovernanceMember(identity)) {
    // Recorded, then refused. An attempt to reach a governance endpoint from
    // outside the group is worth knowing about whether or not it succeeded.
    options.store.record(
      identity,
      'UNAUTHORISED_ATTEMPT',
      'endpoint',
      `${method} ${url.pathname}`,
      null,
      null,
      null,
    );
    send(response, 403, {
      errors: [
        { code: 'FORBIDDEN', field: '', message: 'This action requires AI governance membership.' },
      ],
    });
    return;
  }

  let body: unknown;
  try {
    body = method === 'POST' ? await readBody(request) : undefined;
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE';
    send(response, tooLarge ? 413 : 400, {
      errors: [
        {
          code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'MALFORMED_JSON',
          field: '',
          message: tooLarge ? 'Request body too large.' : 'Request body is not valid JSON.',
        },
      ],
    });
    return;
  }

  const result = await route.handler({
    identity,
    params: matchPattern(route.pattern, url.pathname) ?? {},
    query: url.searchParams,
    body,
    now: new Date(),
    store: options.store,
  });

  send(response, result.status, result.body);
}
