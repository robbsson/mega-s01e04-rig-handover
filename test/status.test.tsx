import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest with line counts', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    const text = (night: string) => {
      const m = html.match(new RegExp(`<li><a href="/digest/${night}">${night}</a>(.*?)</li>`));
      return (m?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    };
    expect(text('2026-10-28')).toBe('· ok 10 · retry 4 · fail 1');
    expect(text('2026-10-27')).toMatch(/^· ok \d+ · retry \d+ · fail \d+$/);
    for (const night of ['2026-10-28', '2026-10-27']) {
      expect((await app.request(`/digest/${night}`)).status).toBe(200);
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
