import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('reads 5 jobs, sorted by job, and counts the truncated last line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the latest error after a later ok run', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('reports a failed job with its error', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', runs: 1 });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('keeps times as written, offset included', () => {
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('ignores blank lines and counts bad shapes', () => {
    const lines = [
      '',
      '   ',
      '{"at":"t1","job":"a","status":"ok","owner":"x"}',
      '{"at":"t2","job":"a","status":"done","owner":"x"}',
      '{"at":"t3","job":"a","status":"ok"}',
      '[1,2]',
      'null',
      '{"at":"t4","job":"a","status":"retry","owner":"y","error":"e"}',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(4);
    expect(night?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(night?.rows).toEqual([
      { job: 'a', owner: 'y', runs: 2, retries: 1, lastStatus: 'retry', lastError: 'e', firstAt: 't1', lastAt: 't4' },
    ]);
  });
});
