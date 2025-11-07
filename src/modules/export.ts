import * as vscode from 'vscode';
import { SinkRegistry } from '../core/registry';
import { CsvSink } from '../sinks/csv.sink';
import { JiraSink } from '../sinks/jira.sink';
import { NotionSink } from '../sinks/notion.sink';
import { PromptService } from '../core/prompts';
import { globalSecretStore } from '../core/secret-store';
import { ExportOrchestrator } from '../core/orchestrator';
import type { Session } from '../core/types';
import { Utils } from '../utils';
import { TimeItCacheProvider } from '../core/cache/index.cache';

export function registerExportCommands(ctx: vscode.ExtensionContext, utils: Utils) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('clockit.chooseSinks', chooseSinksCommand),
    // internal command called by session module
    vscode.commands.registerCommand('clockit._exportSession', (session: Session) => exportViaOrchestrator(ctx, utils, session)),
  );
}

async function exportViaOrchestrator(ctx: vscode.ExtensionContext, utils: Utils, session: Session) {
  const cfg = vscode.workspace.getConfiguration();
  const enabledSinksSetting = cfg.get<string[]>('clockit.enabledSinks');
  const askEveryTime = cfg.get<boolean>('clockit.askSinksEachTime') ?? true;

  // Always prompt before export
  const sinksToUse = await promptForSinks(enabledSinksSetting);
  if (!sinksToUse || sinksToUse.length === 0) {
    utils.notify('No sinks selected. Skipping export.', 'warn');
    return;
  }
  if (!askEveryTime) {
    await cfg.update('clockit.enabledSinks', sinksToUse, vscode.ConfigurationTarget.Workspace);
  }

  const registry = new SinkRegistry();
  registry.register('csv',  (c) => new CsvSink(c));
  registry.register('jira', (c) => new JiraSink(c));
  registry.register('notion',(c) => new NotionSink(c));

  const sinkConfigs = [
    {
      kind: 'csv',
      enabled: sinksToUse.includes('csv'),
      options: {
        outputDirectory: cfg.get('clockit.csv.outputDirectory'),
        filename: cfg.get('clockit.csv.filename'),
        addHeaderIfMissing: cfg.get('clockit.csv.addHeaderIfMissing'),
        ensureDirectory: cfg.get('clockit.csv.ensureDirectory'),
      },
    },
    {
      kind: 'jira',
      enabled: sinksToUse.includes('jira'),
      options: {
        issueKey: session.issueKey ?? undefined,
      },
    },
    {
      kind: 'notion',
      enabled: sinksToUse.includes('notion'),
      options: {},
    },
  ];

  const sinks = registry.create(sinkConfigs);
    const cacheProvider = new TimeItCacheProvider(ctx); // memory + globalState

  const orchestrator = new ExportOrchestrator(sinks, new PromptService(globalSecretStore(ctx), cacheProvider.memoryOnly()));
  const results = await orchestrator.hydrateAndExport(session);

  results.forEach((r: any) => {
    if (r.ok) {utils.notify(`✅ ${r.kind.toUpperCase()}: ${r.message ?? 'Success'}`);}
    else {utils.notify(`❌ ${r.kind.toUpperCase()}: ${r.message ?? 'Failed'}`, 'error');}
  });
}

export async function chooseSinksCommand() {
  const picks = await promptForSinks(
    vscode.workspace.getConfiguration().get<string[]>('clockit.enabledSinks') ?? ['csv']
  );
  if (!picks) {return;}
  await vscode.workspace.getConfiguration().update('clockit.enabledSinks', picks, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`TimeIt sinks set to: ${picks.join(', ')}`);
}

async function promptForSinks(current?: string[]) {
  const all = ['csv', 'jira', 'notion'];
  const selected = new Set(current && current.length ? current : ['csv']);
  const picks = await vscode.window.showQuickPick(
    all.map(v => ({ label: v.toUpperCase(), picked: selected.has(v), value: v })),
    { canPickMany: true, title: 'Select export sinks for this session' }
  );
  if (!picks) {return undefined;}
  return picks.map(p => p.value);
}