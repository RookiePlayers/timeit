import { BaseSink, TimeSinkConfig } from '../core/sink';
import { Session, Result } from '../core/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class CsvSink extends BaseSink {
  constructor(cfg: TimeSinkConfig) { super({ ...cfg, kind: 'csv' }); }
  validate(): Result {
    // options: { outputDirectory?: string; filename?: string; addHeaderIfMissing?: boolean }
    return { ok: true };
  }
  private expand(p?: string) {
    if (!p) {return p;}
    if (p === '~') {return os.homedir();}
    if (p.startsWith('~/')) {return path.join(os.homedir(), p.slice(2));}
    return p;
  }
  async export(s: Session): Promise<Result> {
  const ensureDir = Boolean(this.options.ensureDirectory ?? true);

  const dir = this.expand(String(this.options.outputDirectory || '')) ||
    process.env.WORKSPACE_ROOT ||
    path.join(os.homedir(), '.clockit');

  const file = String(this.options.filename || 'time_log.csv');
  const addHeader = Boolean(this.options.addHeaderIfMissing ?? true);
  const p = path.join(dir, file);

  try {
    if (ensureDir) {
      await fs.mkdir(dir, { recursive: true });
    } else {
      // verify exists if we’re not allowed to create
      await fs.access(dir);
    }
  } catch (e: any) {
    return { ok: false, message: `CSV directory not available: ${dir}`, error: e };
  }

  const header = 'startedIso,endedIso,durationSeconds,workspace,repoPath,branch,issueKey,comment\n';
    try {
      let exists = true;
      try { await fs.access(p); } catch { exists = false; }

      const row = [
        s.startedIso, s.endedIso, s.durationSeconds,
        s.workspace ?? '', s.repoPath ?? '', s.branch ?? '', s.issueKey ?? '', s.comment ?? ''
      ].map(v => {
        const str = String(v ?? '');
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',') + '\n';

      const chunk = (!exists && addHeader ? header : '') + row;
      await fs.appendFile(p, chunk, 'utf8');
      return { ok: true, message: `CSV -> ${p}` };
    } catch (e: any) {
      return { ok: false, error: e };
    }
  }
}