import type { ProxySpec } from './types';

/** Thrown when a proxy skill cannot forward the request (bad env, network). */
export class ProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyError';
  }
}

export interface ProxyInit {
  /** HTTP method of the incoming invocation. */
  method: string;
  /** Incoming request headers (for `forwardHeaders` and content-type). */
  headers: Headers | Record<string, string>;
  /** Request body to forward (a stream, string, or null). */
  body?: RequestInit['body'];
  /** Query string to append to the upstream URL, including the leading `?`. */
  query?: string;
  signal?: AbortSignal;
}

/** Substitute `${VAR}` references with environment values; throw if unset. */
function interpolateEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const resolved = env[name];
    if (resolved === undefined) {
      throw new ProxyError(`environment variable ${name} (used in a proxy header) is not set`);
    }
    return resolved;
  });
}

function buildHeaders(spec: ProxySpec, incoming: Headers, env: NodeJS.ProcessEnv): Headers {
  const headers = new Headers();
  // Pass the incoming content-type through so the upstream parses the body.
  const contentType = incoming.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }
  // Forward explicitly whitelisted incoming headers.
  for (const name of spec.forwardHeaders) {
    const value = incoming.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  // Declared headers win and may inject secrets from the environment.
  for (const [key, raw] of Object.entries(spec.headers)) {
    headers.set(key, interpolateEnv(raw, env));
  }
  return headers;
}

/**
 * Forward a request to a `mode: proxy` skill's upstream and return the upstream
 * response (status, content-type, and body passed through - streaming intact).
 *
 * Declared headers are resolved against `env` at call time, so an API key lives
 * in the server's environment and is never exposed to the client.
 */
export async function proxyRequest(
  spec: ProxySpec,
  init: ProxyInit,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  const incoming = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
  const headers = buildHeaders(spec, incoming, env);
  const method = spec.method ?? init.method;
  const url = spec.url + (init.query ?? '');

  const hasBody =
    method !== 'GET' && method !== 'HEAD' && init.body !== undefined && init.body !== null;
  const fetchInit: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    redirect: 'follow',
    signal: init.signal,
  };
  if (hasBody) {
    fetchInit.body = init.body;
    // Required by undici when the body is a stream; harmless otherwise.
    fetchInit.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, fetchInit);
  } catch (err) {
    throw new ProxyError(
      `upstream request to ${spec.url} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const outHeaders = new Headers();
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) {
    outHeaders.set('content-type', upstreamType);
  }
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) {
    outHeaders.set('content-disposition', disposition);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
