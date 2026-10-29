import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

const OK_NIGHT = '2026-10-28';
const EMPTY_NIGHT = '2026-10-27';
const BAD_LINE_NIGHT = '2026-10-29';
const MISSING_NIGHT = '2026-10-30';

// Deliberately not in alphabetical order, so the sort is visible in the page.
const okLog = [
  '{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-10-28T23:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T23:31:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '',
].join('\n');

const badLineLog = [
  '{"at":"2026-10-29T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T02:00:0',
  '{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '',
].join('\n');

beforeAll(() => {
  writeFileSync(join(runsDir, `${OK_NIGHT}.jsonl`), okLog);
  writeFileSync(join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD_LINE_NIGHT}.jsonl`), badLineLog);
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Job names in the order they appear in the HTML table body.
function htmlJobOrder(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(`<td>${job}</td>`) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);
}

describe('GET /digest/:night (HTML)', () => {
  it('200 for a night with a file, with the job names on the page', async () => {
    const res = await createApp(config).request(`/digest/${OK_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain('<td>lane/sync</td>');
    expect(html).toContain('<td>rig/rotate-logs</td>');
    expect(html).toContain('<td>fixtures/refresh</td>');
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no run log for ${MISSING_NIGHT}`);
  });

  it('404 for a malformed night', async () => {
    const res = await createApp(config).request('/digest/abc');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for abc');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it("says \"1 line didn't parse\" for a night with a bad line", async () => {
    const res = await createApp(config).request(`/digest/${BAD_LINE_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("1 line didn&#39;t parse");
    expect(html).toContain('<td>lane/sync</td>');
    expect(html).toContain('<td>notes/backup</td>');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 for a night with a file, with the rows', async () => {
    const res = await createApp(config).request(`/api/digest/${OK_NIGHT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.night).toBe(OK_NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual([
      'fixtures/refresh',
      'lane/sync',
      'rig/rotate-logs',
    ]);
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `no run log for ${MISSING_NIGHT}` });
  });

  it('404 for a malformed night', async () => {
    const res = await createApp(config).request('/api/digest/abc');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for abc' });
  });

  it('empty night: rows [] and badLines 0', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY_NIGHT, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('bad line night: badLines 1 and the good rows still present', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD_LINE_NIGHT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['lane/sync', 'notes/backup']);
  });
});

describe('page and JSON agree', () => {
  it('job order in the HTML equals the job order in the JSON rows', async () => {
    const app = createApp(config);
    for (const night of [OK_NIGHT, BAD_LINE_NIGHT]) {
      const html = await (await app.request(`/digest/${night}`)).text();
      const json = await (await app.request(`/api/digest/${night}`)).json();
      const jobs: string[] = json.rows.map((r: { job: string }) => r.job);
      expect(jobs.length).toBeGreaterThan(0);
      expect(htmlJobOrder(html, jobs)).toEqual(jobs);
    }
  });
});
