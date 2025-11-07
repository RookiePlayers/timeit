import { secondsToHMS } from './core/util';

export class Utils {
  // ── runtime state
  private running: boolean;
  private startedAt: number;
  private startedIso: string;
  private lastActive: number;

  private tickTimer: NodeJS.Timeout | null = null;
  private idleChecker: NodeJS.Timeout | null = null;

  // ── VS Code deps
  private constructor(
    private vscode: typeof import('vscode'),
    private channel: import('vscode').OutputChannel,
    private statusBar: import('vscode').StatusBarItem,
  ) {
    this.running = false;
    this.startedAt = 0;
    this.startedIso = '';
    this.lastActive = 0;
  }

  // ── singleton
  private static instance: Utils | null = null;
  static getInstance(
    vscode: typeof import('vscode'),
    channel: import('vscode').OutputChannel,
    statusBar: import('vscode').StatusBarItem,
  ): Utils {
    if (!Utils.instance) {
      Utils.instance = new Utils(vscode, channel, statusBar);
    }
    return Utils.instance;
  }

  // ── session helpers (preferred over mutating fields externally)
  beginSession(now = Date.now()) {
    this.running = true;
    this.startedAt = now;
    this.startedIso = new Date(now).toISOString();
    this.lastActive = now;
    this.startTimers();
    this.updateStatusBar();
  }

  endSession(): { startedIso: string; startedAt: number; durationSeconds: number } {
    if (!this.running) {return { startedIso: this.startedIso, startedAt: this.startedAt, durationSeconds: 0 };}

    const now = Date.now();
    const rawDurationSeconds = Math.max(0, Math.floor((now - this.startedAt) / 1000));

    this.running = false;
    this.clearTimers();
    this.updateStatusBar();

    return {
      startedIso: this.startedIso,
      startedAt: this.startedAt,
      durationSeconds: rawDurationSeconds,
    };
  }

  markActivity(ts = Date.now()) {
    if (this.running) {this.lastActive = ts;}
  }

  isRunning() { return this.running; }
  getStartedIso() { return this.startedIso; }

  // ── timers / status
  private startTimers() {
    const idleMinutes = this.vscode.workspace.getConfiguration().get<number>('clockit.idleTimeoutMinutes') ?? 5;

    this.tickTimer = setInterval(() => {
      if (!this.running) {return;}
      const sec = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
      this.statusBar.text = `$(watch) ${secondsToHMS(sec)} — Stop`;
    }, 1000);

    this.idleChecker = setInterval(() => {
      if (!this.running) {return;}
      const idleMs = Date.now() - this.lastActive;
      if (idleMs > idleMinutes * 60_000) {
        // shift start forward to discount idle time
        this.startedAt += idleMs;
        this.lastActive = Date.now();
      }
    }, 5_000);
  }

  private clearTimers() {
    if (this.tickTimer) {clearInterval(this.tickTimer);}
    if (this.idleChecker) {clearInterval(this.idleChecker);}
    this.tickTimer = null;
    this.idleChecker = null;
  }

  updateStatusBar() {
    if (this.running) {
      const sec = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
      this.statusBar.text = `$(watch) ${secondsToHMS(sec)} — Stop`;
      this.statusBar.tooltip = 'Clockit | Click to stop & log';
    } else {
      this.statusBar.text = '$(watch) Start';
      this.statusBar.tooltip = 'Clockit | Click to start logging';
    }
  }

  dispose() {
    this.clearTimers();
  }

  // ── notifications
  notify(msg: string, type: 'info' | 'warn' | 'error' = 'info') {
    const show = this.vscode.workspace.getConfiguration().get<boolean>('clockit.showNotifications') ?? true;
    if (!show) {return;}
    if (type === 'info') {this.vscode.window.showInformationMessage(msg);}
    else if (type === 'warn') {this.vscode.window.showWarningMessage(msg);}
    else {this.vscode.window.showErrorMessage(msg);}
  }

  // ── CSV helpers
  async openCsvLog() {
    const cfg = this.vscode.workspace.getConfiguration();
    const outDir = (cfg.get<string>('clockit.csv.outputDirectory') || '').trim();
    const filename = cfg.get<string>('clockit.csv.filename') || 'time_log.csv';

    const path = await import('path');
    const os = await import('os');

    const root =
      outDir ||
      this.vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
      path.join(os.homedir(), '.clockit');

    const full = path.join(root, filename);
    const uri = this.vscode.Uri.file(full);

    try {
      const doc = await this.vscode.workspace.openTextDocument(uri);
      await this.vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      this.notify('CSV file not found yet — stop a session first to create it.', 'warn');
    }
  }

  async chooseCsvFolder() {
    const selection = await this.vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Use this folder for Clockit CSV',
      defaultUri: this.vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!selection || selection.length === 0) {return;}

    const folderUri = selection[0];
    const cfg = this.vscode.workspace.getConfiguration();
    await cfg.update('clockit.csv.outputDirectory', folderUri.fsPath, this.vscode.ConfigurationTarget.Workspace);

    const ensure = cfg.get<boolean>('clockit.csv.ensureDirectory') ?? true;
    if (ensure) {
      const fs = await import('fs/promises');
      await fs.mkdir(folderUri.fsPath, { recursive: true }).catch(() => {});
    }
    this.vscode.window.showInformationMessage(`Clockit CSV folder set to: ${folderUri.fsPath}`);
  }

  // ── logging
  log(...args: unknown[]) {
    const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    this.channel.appendLine(`[${new Date().toISOString()}] ${line}`);
    console.log('[Clockit]', ...args);
  }

  // keep it private & static so it doesn’t leak as API
  private static exists<T>(v: T | null | undefined): v is T {
    return v !== null && v !== undefined && (typeof v !== 'string' || v.trim() !== '');
  }
}