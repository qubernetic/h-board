import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index';

describe('GET /api/health', () => {
  it('answers ok with the version', async () => {
    const response = await createApp({ version: '1.2.3' }).request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: '1.2.3' });
  });
});

describe('an unknown path', () => {
  it('is not found', async () => {
    const response = await createApp({ version: '1.2.3' }).request('/api/nothing');
    expect(response.status).toBe(404);
  });
});
