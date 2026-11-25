import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

/**
 * The caller's address, for the slow-down of failed sign-ins. Behind a trusted reverse proxy it is
 * the last address in `X-Forwarded-For`, the one the proxy added; otherwise the connection's.
 */
export function clientAddress(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (forwarded !== undefined && forwarded !== '') return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
