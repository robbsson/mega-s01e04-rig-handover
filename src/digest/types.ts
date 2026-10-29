// The digest's contract (plan.md § 1). Section 2 builds against this file alone.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night. Times keep the log's offset, never converted to UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // the latest `error` seen for this job, even if a later run was ok
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // non-blank lines that didn't parse as a RunLine; counted, never thrown
};

// null: no runs/<night>.jsonl on disk (the page answers 404). An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
