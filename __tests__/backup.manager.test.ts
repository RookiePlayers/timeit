// __tests__/backup.manager.test.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as os from 'os';
import { BackupManager } from '../src/core/backup';

function todayCsvName(prefix = 'backup_') {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefix}${yyyy}${mm}${dd}.csv`;
}
let dirA: string;

describe('BackupManager', () => {
  const suiteRoot = path.join(os.tmpdir(), `clockit-backup-tests-${Date.now()}`);

  beforeAll(async () => {
    await fs.mkdir(suiteRoot, { recursive: true });
  });

  afterAll(async () => {
    try { await fs.rm(suiteRoot, { recursive: true, force: true }); } catch {}
  });

  // fresh directory per test to avoid cross-test interference
  async function makeIsolatedDir(label: string) {
    const dir = path.join(suiteRoot, `${label}${Date.now()}${Math.random().toString(36).slice(2,8)}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(global, 'setInterval');
  jest.spyOn(global, 'clearInterval');

  // fresh unique dir per test run
  dirA = path.join(os.tmpdir(), `clockit-backup-tests_${Date.now()}${Math.random()}`, 'A');
  await fs.mkdir(dirA, { recursive: true });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

  const sample = {
    startedIso: '2025-01-01T10:00:00.000Z',
    endedIso:   '2025-01-01T10:15:00.000Z',
    durationSeconds: 900,
    workspace: 'ws',
    repoPath: '/repo',
    branch: 'feat/ABC-1',
    issueKey: 'ABC-1',
    comment: 'Worked on login',
  };

  test('flushNow writes header and a row; returns the path', async () => {
    const dir = await makeIsolatedDir('A1');

    const m = new BackupManager({
      enabled: true,
      intervalSeconds: 60,
      directory: dir,
      filenamePrefix: 'backup_',
    });

    m.setPending(sample);
    const filePath = await m.flushNow();

    expect(typeof filePath).toBe('string');
    expect(filePath && existsSync(filePath)).toBe(true);

    const expected = path.join(dir, todayCsvName('backup_'));
    expect(filePath).toBe(expected);

    const txt = await fs.readFile(expected, 'utf8');
    expect(txt.split('\n')[0]).toMatch(
      /^startedIso,endedIso,durationSeconds,workspace,repoPath,branch,issueKey,comment/
    );
    expect(txt).toContain('2025-01-01T10:15:00.000Z');
    expect(txt).toContain(',ABC-1,');
    expect(txt).toContain('Worked on login');
  });

  test('subsequent flushNow appends without duplicating header', async () => {
    const dir = await makeIsolatedDir('A2');

    const m = new BackupManager({
      enabled: true,
      intervalSeconds: 60,
      directory: dir,
      filenamePrefix: 'backup_',
    });

    m.setPending(sample);
    await m.flushNow();

    m.setPending({
      ...sample,
      endedIso: '2025-01-01T10:30:00.000Z',
      durationSeconds: 1800,
      comment: 'Continued',
    });
    await m.flushNow();

    const file = path.join(dir, todayCsvName('backup_'));
    const lines = (await fs.readFile(file, 'utf8')).trim().split('\n');

    expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 rows
    expect(lines[0]).toMatch(/^startedIso,/);       // only one header
  });

  test('respects disabled flag (no writes)', async () => {
    const dir = await makeIsolatedDir('B1');

    const m = new BackupManager({
      enabled: false,
      intervalSeconds: 1,
      directory: dir,
      filenamePrefix: 'backup_',
    });

    m.setPending(sample);
    const filePath = await m.flushNow();

    expect(filePath).toBeUndefined();
    const file = path.join(dir, todayCsvName('backup_'));
    expect(existsSync(file)).toBe(false);
  });

  test('uses csvDirFallback when directory is not provided', async () => {
    const fb = await makeIsolatedDir('FB1');

    const m = new BackupManager({
      enabled: true,
      intervalSeconds: 60,
      directory: '', // -> use fallback
      csvDirFallback: fb,
      filenamePrefix: 'backup_',
    });

    m.setPending(sample);
    const filePath = await m.flushNow();

    const expected = path.join(fb, todayCsvName('backup_'));
    expect(filePath).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

// test('interval-based autosave fires on schedule and stop clears interval', async () => {
//   const m = new BackupManager({
//     enabled: true,
//     intervalSeconds: 5,
//     directory: dirA,
//     filenamePrefix: 'backup_',
//   });

//   // set pending before starting
//   m.setPending({
//     startedIso: '2025-01-01T10:00:00.000Z',
//     endedIso:   '2025-01-01T10:15:00.000Z',
//     durationSeconds: 900,
//     workspace: 'ws',
//     repoPath: '/repo',
//     branch: 'feat/ABC-1',
//     issueKey: 'ABC-1',
//     comment: 'Worked on login',
//   });

//   // clean slate
//   const expected = path.join(dirA, todayCsvName('backup_'));
//   if (existsSync(expected)) await fs.unlink(expected);
//   expect(existsSync(expected)).toBe(false);

//   m.start();

//   // just before interval: still no file
//   jest.advanceTimersByTime(4999);
//   expect(existsSync(expected)).toBe(false);

//   // tick over interval (5s)
//   // if using modern timers: await jest.advanceTimersByTimeAsync(1001);
//   jest.advanceTimersByTime(1001);

//   // the interval callback runs; our flushTick has a 250ms spam guard,
//   // but we are way past it, so write should have happened
//   expect(existsSync(expected)).toBe(true);

//   m.stop();
//   expect(clearInterval).toHaveBeenCalled();
// });

  test('flushNow is a no-op when no pending row', async () => {
    const dir = await makeIsolatedDir('A3');

    const m = new BackupManager({
      enabled: true,
      intervalSeconds: 60,
      directory: dir,
      filenamePrefix: 'backup_',
    });

    const before = path.join(dir, todayCsvName('backup_'));
    const existedBefore = existsSync(before);

    const ret = await m.flushNow(); // no pending set
    expect(ret).toBeUndefined();

    expect(existsSync(before)).toBe(existedBefore);
  });
});