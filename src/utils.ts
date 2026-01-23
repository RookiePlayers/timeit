import { secondsToHMS } from './core/util';
import type { Session } from './core/types';
import { configTargetForKey } from './core/config-target';
import * as os from 'os';
import { execSync } from 'child_process';

export class Utils {
  // ── runtime state
  private running: boolean;
  private startedAt: number;
  private startedIso: string;
  private lastActive: number;
  private lastBackupPush = 0;
  private lastTick = 0;
  private idleSeconds = 0;
  private perFileSeconds: Map<string, number> = new Map();
  private perLanguageSeconds: Map<string, number> = new Map();
  private linesAdded = 0;
  private linesDeleted = 0;
  private activeUri?: string;
  private activeLanguage?: string;
  private authorName?: string;
  private authorEmail?: string;
  private machine?: string;
  private ideName?: string;
  private paused = false;
  private focusTimerEnd: number | null = null;
  private focusTimerTimeout: NodeJS.Timeout | null = null;
  private focusTicker: NodeJS.Timeout | null = null;

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
    this.lastTick = 0;
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
    this.paused = false;
    this.startedAt = now;
    this.startedIso = new Date(now).toISOString();
    this.lastActive = now;
    this.lastTick = now;
    this.resetMetrics();
    this.captureIdentity();
    this.onEditorChanged(this.vscode.window.activeTextEditor, now);
    this.startTimers();
    void this.pushBackupSnapshot(now, true);
    this.updateStatusBar();
  }

  endSession(): { startedIso: string; startedAt: number; durationSeconds: number } {
    if (!this.running) { return { startedIso: this.startedIso, startedAt: this.startedAt, durationSeconds: 0 }; }

    const now = Date.now();
    const rawDurationSeconds = Math.max(0, Math.floor((now - this.startedAt) / 1000));

    // capture a final backup snapshot before we stop
    void this.pushBackupSnapshot(now, true);

    this.accrueTime(now);
    this.running = false;
    this.paused = false;
    this.clearTimers();
    this.updateStatusBar();

    return {
      startedIso: this.startedIso,
      startedAt: this.startedAt,
      durationSeconds: rawDurationSeconds,
    };
  }

  markActivity(ts = Date.now()) {
    if (this.running) { this.lastActive = ts; }
  }

  onEditorChanged(editor?: import('vscode').TextEditor | undefined, ts = Date.now()) {
    this.accrueTime(ts);
    this.activeUri = editor?.document?.uri.toString();
    this.activeLanguage = editor?.document?.languageId;
  }

  recordTextChange(e: import('vscode').TextDocumentChangeEvent) {
    const now = Date.now();
    this.markActivity(now);
    if (!this.running || this.paused) { return; }

    // Approximate line deltas
    for (const change of e.contentChanges) {
      const added = change.text.split(/\r\n|\n/).length - 1;
      const removed = change.range.end.line - change.range.start.line;
      this.linesAdded += added;
      this.linesDeleted += Math.max(0, removed);
    }
  }

  getMetricsSnapshot(now = Date.now()) {
    this.accrueTime(now);
    return {
      idleSeconds: this.idleSeconds,
      linesAdded: this.linesAdded,
      linesDeleted: this.linesDeleted,
      perFileSeconds: Object.fromEntries(this.perFileSeconds),
      perLanguageSeconds: Object.fromEntries(this.perLanguageSeconds),
    };
  }

  isRunning() { return this.running; }
  getStartedIso() { return this.startedIso; }
  isPaused() { return this.paused; }

  pauseSession() {
    if (!this.running || this.paused) { return; }
    this.accrueTime(Date.now());
    this.paused = true;
    this.updateStatusBar();
  }

  resumeSession() {
    if (!this.running || !this.paused) { return; }
    const now = Date.now();
    this.paused = false;
    this.lastActive = now;
    this.lastTick = now;
    this.updateStatusBar();
  }

  startFocusTimer(minutes: number) {
    const ms = Math.max(1, Math.floor(minutes * 60 * 1000));
    if (this.focusTimerTimeout) { clearTimeout(this.focusTimerTimeout); }
    if (this.focusTicker) { clearInterval(this.focusTicker); }
    this.focusTimerEnd = Date.now() + ms;
    this.focusTimerTimeout = setTimeout(() => {
      this.focusTimerEnd = null;
      this.focusTimerTimeout = null;
      this.focusTicker && clearInterval(this.focusTicker);
      this.focusTicker = null;
      this.updateStatusBar();
      this.notify(`Focus timer done (${minutes}m)!`);
    }, ms);
    this.focusTicker = setInterval(() => {
      if (!this.focusTimerEnd) {
        if (this.focusTicker) { clearInterval(this.focusTicker); }
        this.focusTicker = null;
        return;
      }
      this.updateStatusBar();
    }, 1000);
    this.updateStatusBar();
    this.notify(`Focus timer set for ${minutes}m.`);
  }

  // ── timers / status
  private startTimers() {
    const idleMinutes = this.vscode.workspace.getConfiguration().get<number>('clockit.idleTimeoutMinutes') ?? 5;

    this.tickTimer = setInterval(() => {
      if (!this.running) { return; }
      const now = Date.now();
      this.accrueTime(now);
      const sec = Math.max(0, Math.floor((now - this.startedAt) / 1000));
      this.statusBar.text = this.paused
        ? `$(debug-pause) Paused`
        : `$(watch) ${secondsToHMS(sec)} — Stop`;
      void this.pushBackupSnapshot(now);
      this.updateStatusBar();
    }, 1000);

    this.idleChecker = setInterval(() => {
      if (!this.running) { return; }
      const idleMs = Date.now() - this.lastActive;
      if (idleMs > idleMinutes * 60_000) {
        // shift start forward to discount idle time
        this.startedAt += idleMs;
        this.lastActive = Date.now();
      }
    }, 5_000);
  }

  private clearTimers() {
    if (this.tickTimer) { clearInterval(this.tickTimer); }
    if (this.idleChecker) { clearInterval(this.idleChecker); }
    this.tickTimer = null;
    this.idleChecker = null;
    if (this.focusTimerTimeout) { clearTimeout(this.focusTimerTimeout); }
    if (this.focusTicker) { clearInterval(this.focusTicker); }
    this.focusTimerTimeout = null;
    this.focusTicker = null;
  }

  updateStatusBar() {
    if (this.running) {
      const sec = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
      const focusText = this.focusTimerEnd
        ? ` | Focus ${secondsToHMS(Math.max(0, Math.ceil((this.focusTimerEnd - Date.now()) / 1000)))}`
        : '';
      if (this.paused) {
        this.statusBar.text = `$(debug-pause) Paused${focusText}`;
        this.statusBar.tooltip = 'Clockit | Click pause/resume via commands';
      } else {
        this.statusBar.text = `$(watch) ${secondsToHMS(sec)} — Stop${focusText}`;
        this.statusBar.tooltip = 'Clockit | Click to stop & log';
      }
    } else {
      const focusText = this.focusTimerEnd
        ? ` | Focus ${secondsToHMS(Math.max(0, Math.ceil((this.focusTimerEnd - Date.now()) / 1000)))}`
        : '';
      this.statusBar.text = `$(watch) Start${focusText}`;
      this.statusBar.tooltip = 'Clockit | Click to start logging';
    }
  }

  dispose() {
    this.clearTimers();
  }

  // ── notifications
  notify(msg: string, type: 'info' | 'warn' | 'error' = 'info') {
    const show = this.vscode.workspace.getConfiguration().get<boolean>('clockit.showNotifications') ?? true;
    if (!show) { return; }
    if (type === 'info') { this.vscode.window.showInformationMessage(msg); }
    else if (type === 'warn') { this.vscode.window.showWarningMessage(msg); }
    else { this.vscode.window.showErrorMessage(msg); }
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
      process.cwd();

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
    if (!selection || selection.length === 0) { return; }

    const folderUri = selection[0];
    const cfg = this.vscode.workspace.getConfiguration();
    await cfg.update('clockit.csv.outputDirectory', folderUri.fsPath, configTargetForKey('clockit.csv.outputDirectory'));

    const ensure = cfg.get<boolean>('clockit.csv.ensureDirectory') ?? true;
    if (ensure) {
      const fs = await import('fs/promises');
      await fs.mkdir(folderUri.fsPath, { recursive: true }).catch(() => { });
    }
    const choice = await this.vscode.window.showInformationMessage(
      `Clockit CSV folder set to: ${folderUri.fsPath}`,
      'Login to Clockit Cloud',
      'Skip'
    );
    if (choice === 'Login to Clockit Cloud') {
      await this.promptCloudSetup();
    }
  }

  private async promptCloudSetup() {
    const cfg = this.vscode.workspace.getConfiguration();
    if (!this.ensureCloudConfigRegistered(cfg)) { return; }

    const apiUrl = await this.vscode.window.showInputBox({
      title: 'Clockit Cloud Ingest URL',
      prompt: 'Enter your Clockit ingest endpoint (Firebase Function URL)',
      ignoreFocusOut: true,
      value: (cfg.get<string>('clockit.cloud.apiUrl') || '').trim(),
    });
    if (!apiUrl) { return; }

    const apiToken = await this.vscode.window.showInputBox({
      title: 'Clockit API Token',
      prompt: 'Paste the API token from the Clockit dashboard (Profile → API Tokens)',
      password: true,
      ignoreFocusOut: true,
      value: (cfg.get<string>('clockit.cloud.apiToken') || '').trim(),
    });
    if (!apiToken) { return; }

    await cfg.update('clockit.cloud.apiUrl', apiUrl, this.vscode.ConfigurationTarget.Global);
    await cfg.update('clockit.cloud.apiToken', apiToken, this.vscode.ConfigurationTarget.Global);
    await cfg.update('clockit.cloud.enabled', true, this.vscode.ConfigurationTarget.Global);

    this.vscode.window.showInformationMessage('Clockit Cloud backup enabled. Future sessions will upload automatically.');
  }

  private ensureCloudConfigRegistered(cfg: import('vscode').WorkspaceConfiguration) {
    const keys = ['clockit.cloud.apiUrl', 'clockit.cloud.apiToken', 'clockit.cloud.enabled'];
    const registered = keys.every(k => !!cfg.inspect?.(k));
    if (!registered) {
      this.vscode.window.showErrorMessage('Clockit Cloud settings are unavailable in this version of Clockit. Please update the extension and try again.');
    }
    return registered;
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

  private backupEnabled() {
    return this.vscode.workspace.getConfiguration('clockit.backup').get<boolean>('enabled') ?? true;
  }

  private async pushBackupSnapshot(now: number, force = false) {
    if (!this.backupEnabled() || !this.startedIso) { return; }

    const intervalSetting = this.vscode.workspace.getConfiguration('clockit.backup').get<number>('intervalSeconds') ?? 60;
    if (intervalSetting <= 0 && !force) { return; } // interval disabled; only allow forced snapshots

    const intervalMs = Math.max(1, intervalSetting) * 1000;
    if (!force && now - this.lastBackupPush < intervalMs) { return; }
    this.lastBackupPush = now;

    const metrics = this.getMetricsSnapshot(now);
    const durationSeconds = Math.max(0, Math.floor((now - this.startedAt) / 1000));
    const snapshot: Session = {
      startedIso: this.startedIso,
      endedIso: new Date(now).toISOString(),
      durationSeconds,
      idleSeconds: metrics.idleSeconds,
      linesAdded: metrics.linesAdded,
      linesDeleted: metrics.linesDeleted,
      perFileSeconds: metrics.perFileSeconds,
      perLanguageSeconds: metrics.perLanguageSeconds,
      authorName: this.authorName,
      authorEmail: this.authorEmail,
      machine: this.machine,
      ideName: this.ideName,
      workspace: this.vscode.workspace.name,
      repoPath: this.vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      branch: null,
      issueKey: null,
      comment: '',
    };

    try {
      await this.vscode.commands.executeCommand('clockit._internal.updateBackup', snapshot);
    } catch (err) {
      this.log('backup snapshot failed', err);
    }
  }

  private async clearBackupPending() {
    if (!this.backupEnabled()) { return; }
    try {
      await this.vscode.commands.executeCommand('clockit._internal.updateBackup');
    } catch {
      // ignore; backup is best-effort
    }
  }

  private captureIdentity() {
    const cfg = this.vscode.workspace.getConfiguration();
    const nameCfg = (cfg.get<string>('clockit.author.name') || '').trim();
    const emailCfg = (cfg.get<string>('clockit.author.email') || '').trim();
    const machineCfg = (cfg.get<string>('clockit.machineName') || '').trim();

    this.authorName = nameCfg || this.readGitConfig('user.name') || undefined;
    this.authorEmail = emailCfg || this.readGitConfig('user.email') || undefined;
    this.machine = machineCfg || os.hostname();
    this.ideName = this.vscode.env.appName;
  }

  private readGitConfig(key: string) {
    try {
      return execSync(`git config --get ${key}`, {
        encoding: 'utf8',
        cwd: this.vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  }

  private accrueTime(now: number) {
    if (!this.running || this.paused) { this.lastTick = now; return; }

    const delta = Math.max(0, Math.floor((now - this.lastTick) / 1000));
    if (!delta) { return; }

    const idleMinutes = this.vscode.workspace.getConfiguration().get<number>('clockit.idleTimeoutMinutes') ?? 5;
    const idle = now - this.lastActive > idleMinutes * 60_000;

    if (idle) {
      this.idleSeconds += delta;
      this.lastTick = now;
      return;
    }

    if (this.activeUri) {
      this.perFileSeconds.set(this.activeUri, (this.perFileSeconds.get(this.activeUri) ?? 0) + delta);
    }
    if (this.activeLanguage) {
      this.perLanguageSeconds.set(this.activeLanguage, (this.perLanguageSeconds.get(this.activeLanguage) ?? 0) + delta);
    }
    this.lastTick = now;
  }

  private resetMetrics() {
    this.idleSeconds = 0;
    this.linesAdded = 0;
    this.linesDeleted = 0;
    this.perFileSeconds.clear();
    this.perLanguageSeconds.clear();
    this.activeUri = undefined;
    this.activeLanguage = undefined;
  }
}
