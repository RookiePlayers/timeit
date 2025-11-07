// src/extension.ts
import * as vscode from 'vscode';

import { registerSessionCommands } from './modules/sessions';
import { registerExportCommands } from './modules/export';
import { registerCredentialCommands } from './modules/credentials';
import { CsvFolderService } from './services/csv-folder';
import { Utils } from './utils';
import { BackupManager } from './core/backup';
import type { Session } from './core/types';

let channel: vscode.OutputChannel;
let statusBar: vscode.StatusBarItem;
let utils: Utils;
let backup: BackupManager | undefined;

/** Call this from your session/timer module whenever the active session snapshot changes */
export function updateBackupFromSession(s?: Session) {
  if (!backup) {return;}
  if (!s) { backup.setPending(undefined); return; }
  backup.setPending({
    startedIso: s.startedIso,
    endedIso: s.endedIso,
    durationSeconds: s.durationSeconds,
    workspace: s.workspace,
    repoPath: s.repoPath,
    branch: s.branch ?? null,
    issueKey: s.issueKey ?? null,
    comment: s.comment ?? null,
  });
}

export async function activate(ctx: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration();

  // ---- Backup manager boot ----
  const enabled         = cfg.get<boolean>('clockit.backup.enabled', true);
  const intervalSeconds = cfg.get<number>('clockit.backup.intervalSeconds', 60);
  const directory       = cfg.get<string>('clockit.backup.directory', '');
  const filenamePrefix  = cfg.get<string>('clockit.backup.filenamePrefix', 'backup_');
  const csvDirFallback  = cfg.get<string>('clockit.csv.outputDirectory', '');

  backup = new BackupManager({
    enabled,
    intervalSeconds,
    directory,
    filenamePrefix,
    csvDirFallback: csvDirFallback || undefined,
  });
  backup.start();

  // Hot-reload backup config on change
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration('clockit.backup')) {return;}
      const bcfg = vscode.workspace.getConfiguration('clockit.backup');

      // stop old + start fresh with new config
      backup?.stop();
      backup = new BackupManager({
        enabled:        bcfg.get('enabled', true),
        intervalSeconds:bcfg.get('intervalSeconds', 60),
        directory:      bcfg.get('directory', ''),
        filenamePrefix: bcfg.get('filenamePrefix', 'backup_'),
        csvDirFallback: csvDirFallback || undefined,
      });
      backup.start();
    })
  );

  // Ensure we flush if the process hits a fatal
  const onUncaught = async (err: unknown) => {
    console.warn('[clockit] uncaughtException', err);
    await backup?.flushNow();
  };
  const onRejection = async (err: unknown) => {
    console.warn('[clockit] unhandledRejection', err);
    await backup?.flushNow();
  };
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);
  ctx.subscriptions.push({
    dispose: () => {
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onRejection);
    }
  });

  // ---- UI wiring ----
  const TIMER_PRIORITY = 10_000;
  const CSV_PRIORITY   = 9_999;  // just to the right of the timer

  channel = vscode.window.createOutputChannel('TimeIt');
  channel.appendLine('[TimeIt] activated');

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, TIMER_PRIORITY);
  statusBar.command = 'clockit.toggle';
  statusBar.show();

  // CSV menu button
  const csvMenuBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, CSV_PRIORITY);
  csvMenuBtn.text = '$(folder) TimeIt CSV';
  csvMenuBtn.tooltip = 'TimeIt CSV actions';
  csvMenuBtn.command = 'clockit.csvMenu';
  csvMenuBtn.show();
  ctx.subscriptions.push(csvMenuBtn);

  utils = Utils.getInstance(vscode, channel, statusBar);
  utils.updateStatusBar();

  // CSV menu command
  const csvSvc = CsvFolderService.getInstance(vscode, utils.notify.bind(utils));
  ctx.subscriptions.push(
    vscode.commands.registerCommand('clockit.csvMenu', () => csvSvc.showCsvMenu())
  );

  // ---- Register feature groups ----
  registerSessionCommands(ctx, utils);
  registerExportCommands(ctx, utils);
  registerCredentialCommands(ctx);

  // Optional: expose an internal command so other modules can push snapshots without importing the function
  ctx.subscriptions.push(
    vscode.commands.registerCommand('clockit._internal.updateBackup', (s?: Session) => {
      updateBackupFromSession(s);
    })
  );

  // Auto-start (optional)
  const autoStart = vscode.workspace.getConfiguration()
    .get<boolean>('clockit.autoStartOnLaunch') ?? true;
  if (autoStart) {
    vscode.commands.executeCommand('clockit.startTimeTracking');
  }

  // Flush/stop backup on extension dispose
  ctx.subscriptions.push({
    dispose: () => {
      backup?.flushNow();
      backup?.stop();
    }
  });
}

export function deactivate() {
  // Belt & suspenders (ctx subscription above will also run)
  backup?.flushNow();
  backup?.stop();
  utils?.dispose();
}