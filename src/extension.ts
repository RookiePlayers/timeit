import * as vscode from 'vscode';

import { registerSessionCommands } from './modules/sessions';
import { registerExportCommands } from './modules/export';
import { registerCredentialCommands } from './modules/credentials';
import { CsvFolderService } from './services/csv-folder';
import { Utils } from './utils';

let channel: vscode.OutputChannel;
let statusBar: vscode.StatusBarItem;
let utils: Utils;

export async function activate(ctx: vscode.ExtensionContext) {
  const TIMER_PRIORITY = 10_000;
const CSV_PRIORITY   = 9_999;  // just to the right of the timer

  channel = vscode.window.createOutputChannel('TimeIt');
  channel.appendLine('[TimeIt] activated');

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, TIMER_PRIORITY);
  statusBar.command = 'timeit.toggle';
  statusBar.show();

  // CSV menu button
  const csvMenuBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, CSV_PRIORITY);
  csvMenuBtn.text = '$(folder) TimeIt CSV';
  csvMenuBtn.tooltip = 'TimeIt CSV actions';
  csvMenuBtn.command = 'timeit.csvMenu';
  csvMenuBtn.show();
  ctx.subscriptions.push(csvMenuBtn);

  utils = Utils.getInstance(vscode, channel, statusBar);
  utils.updateStatusBar();

  // CSV menu command (bind this correctly)
  const csvSvc = CsvFolderService.getInstance(vscode, utils.notify.bind(utils));
  ctx.subscriptions.push(vscode.commands.registerCommand('timeit.csvMenu', () => csvSvc.showCsvMenu()));

  // Register feature groups
  registerSessionCommands(ctx, utils);
  registerExportCommands(ctx, utils);
  registerCredentialCommands(ctx);

  // Auto-start (optional)
  const autoStart = vscode.workspace.getConfiguration().get<boolean>('timeit.autoStartOnLaunch') ?? true;
  if (autoStart) {vscode.commands.executeCommand('timeit.startTimeTracking');}
}

export function deactivate() {
  utils?.dispose();
}