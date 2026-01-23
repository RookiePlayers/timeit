// src/core/backup.ts
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';

// NOTE: Keep vscode import optional to avoid test env issues.
// If you prefer the static import, you can keep it; this version guards usage.
let vscode: typeof import('vscode') | undefined;
try { vscode = require('vscode'); } catch { }

export type BackupRow = {
  startedIso: string;
  endedIso?: string;
  durationSeconds: number;
  title?: string;
  idleSeconds?: number;
  linesAdded?: number;
  linesDeleted?: number;
  perFileSeconds?: Record<string, number>;
  perLanguageSeconds?: Record<string, number>;
  authorName?: string;
  authorEmail?: string;
  machine?: string;
  ideName?: string;
  workspace?: string;
  repoPath?: string;
  branch?: string | null;
  issueKey?: string | null;
  comment?: string | null;
  goals?: import('./types').Goal[];
};

type Opts = {
  enabled: boolean;
  intervalSeconds: number;
  directory?: string;       // explicit override
  filenamePrefix: string;   // e.g. "backup_"
  csvDirFallback?: string;  // CSV sink dir (if any)
};

export class BackupManager {
  private timer: NodeJS.Timeout | null = null;
  private lastFlushedAt = 0;
  private pending?: BackupRow;
  private lastWrittenHash?: string;

  constructor(private opts: Opts) { }

  start() {
    if (!this.opts.enabled || this.timer) { return; }
    const seconds = Math.max(0, this.opts.intervalSeconds);
    // Allow intervalSeconds <= 0 to disable the period timer while keeping manual flushes
    if (seconds <= 0) { return; }

    const ms = seconds * 1000; // no hidden 10s floor
    this.timer = setInterval(() => { void this.flushTick(); }, ms);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); }
    this.timer = null;
  }

  /** Call whenever the active session updates (tick, pause/resume, etc.) */
  setPending(row?: BackupRow) {
    this.pending = row;
  }

  /** Force write now (used on deactivate / fatal error). Returns the file path if written. */
  async flushNow(): Promise<string | undefined> {
    if (!this.opts.enabled) { return; }
    return this.writeIfAny();
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async flushTick() {
    const now = Date.now();
    // (Light) spam guard to avoid back-to-back writes in the same tick storm
    if (now - this.lastFlushedAt < 250) { return; }
    await this.writeIfAny();
  }

  private async writeIfAny(): Promise<string | undefined> {
    if (!this.pending) { return; }

    const file = await this.resolveBackupFilePath(new Date());
    const dir = path.dirname(file);
    await this.ensureDir(dir);

    const exists = fssync.existsSync(file);
    const header =
      'startedIso,endedIso,durationSeconds,idleSeconds,linesAdded,linesDeleted,perFileSeconds,perLanguageSeconds,authorName,authorEmail,machine,ideName,workspace,repoPath,branch,issueKey,comment,goals\n';

    const line =
      [
        csv(this.pending.startedIso),
        csv(this.pending.endedIso ?? ''),
        csv(String(this.pending.durationSeconds ?? 0)),
        csv(String(this.pending.idleSeconds ?? 0)),
        csv(String(this.pending.linesAdded ?? 0)),
        csv(String(this.pending.linesDeleted ?? 0)),
        csv(JSON.stringify(this.pending.perFileSeconds ?? {})),
        csv(JSON.stringify(this.pending.perLanguageSeconds ?? {})),
        csv(this.pending.authorName ?? ''),
        csv(this.pending.authorEmail ?? ''),
        csv(this.pending.machine ?? ''),
        csv(this.pending.ideName ?? ''),
        csv(this.pending.workspace ?? ''),
        csv(this.pending.repoPath ?? ''),
        csv(this.pending.branch ?? ''),
        csv(this.pending.issueKey ?? ''),
        csv(this.pending.comment ?? this.pending.title ?? ''),
        csv(JSON.stringify(this.pending.goals ?? [])),
      ].join(',') + '\n';

    // Skip duplicate snapshots to avoid repeated identical lines
    if (line === this.lastWrittenHash) {
      this.pending = undefined;
      return file;
    }

    if (!exists) {
      await fs.writeFile(file, header + line, 'utf8');
    } else {
      await fs.appendFile(file, line, 'utf8');
    }
    this.lastFlushedAt = Date.now();
    this.lastWrittenHash = line;
    this.pending = undefined;
    void this.ensureGitignoreEntry(file); // best-effort, do not block writes
    return file;
  }

  private async resolveBackupFilePath(d: Date): Promise<string> {
    // Use LOCAL date and hyphenated name: backup_YYYY-MM-DD.csv
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const name = `${this.opts.filenamePrefix}${yyyy}${mm}${dd}.csv`;

    const baseDir = this.resolveBaseDir();
    return path.join(baseDir, name);
  }

  private resolveBaseDir(): string {
    // Priority: explicit backup.directory → csvDirFallback → workspace/.clockit → cwd/.clockit
    const explicit = (this.opts.directory || '').trim();
    const ws = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath;

    // If explicit directory is provided, use it
    if (explicit) {
      // If a file-looking path was provided (e.g., "backup_timelog.csv"), treat its dirname as the target folder.
      const looksLikeFile = /\.[^/\\]+$/.test(explicit);
      const dir = looksLikeFile ? path.dirname(explicit) : explicit;

      // Resolve relative paths against the workspace root when available.
      if (!path.isAbsolute(dir)) {
        return path.join(ws ?? process.cwd(), dir);
      }
      return dir;
    }

    // If no explicit directory but csvDirFallback is provided, use it
    if (this.opts.csvDirFallback) {
      return this.opts.csvDirFallback;
    }

    // Default fallback: workspace/.clockit or cwd/.clockit
    const defaultRoot = ws ?? process.cwd();
    return path.join(defaultRoot, '.clockit');
  }

  private async ensureDir(dir: string) {
    // If dir collapses to root/current, mkdir would be a no-op; skip for safety.
    if (!dir || dir === '.' || dir === '/') { return; }
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      console.warn('[clockit] backup ensureDir failed', err);
      throw err;
    }
  }

  private async ensureGitignoreEntry(filePath: string) {
    try {
      const ws = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath;
      if (!ws) { return; }
      const gitignore = path.join(ws, '.gitignore');
      if (!fssync.existsSync(gitignore)) { return; }

      const rel = path.relative(ws, filePath);
      if (rel.startsWith('..')) { return; } // outside workspace
      const dirRel = path.dirname(rel).replace(/\\/g, '/');
      const pattern = `/${dirRel === '.' ? '' : `${dirRel}/`}${this.opts.filenamePrefix}*.csv`;

      const content = await fs.readFile(gitignore, 'utf8');
      const lines = content.split(/\r?\n/);
      if (dirRel === '.clockit' && !lines.some((line) => line.trim() === '/.clockit/')) {
        lines.push('/.clockit/');
      }
      if (lines.some((line) => line.trim() === pattern)) { return; }
      lines.push(pattern);
      await fs.writeFile(gitignore, lines.join('\n'), 'utf8');
    } catch (err) {
      console.warn('[clockit] failed to update .gitignore for backups', err);
    }
  }
}

function csv(value: string) {
  // Basic CSV escaping
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
