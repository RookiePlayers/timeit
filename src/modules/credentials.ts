import * as vscode from 'vscode';
import type { FieldSpec, TimeSink } from '../core/sink';
import { SinkRegistry } from '../core/registry';
import { CsvSink } from '../sinks/csv.sink';
import { JiraSink } from '../sinks/jira.sink';
import { NotionSink } from '../sinks/notion.sink';
import { globalSecretStore } from '../core/secret-store';

export function registerCredentialCommands(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('clockit.editCredentials',  editCredentialsCommand.bind(null, ctx)),
    vscode.commands.registerCommand('clockit.clearCredentials', clearCredentialsCommand.bind(null, ctx)),
  );
}

async function editCredentialsCommand(ctx: vscode.ExtensionContext) {
  const sinkKind = await vscode.window.showQuickPick(['jira', 'notion', 'csv'], {
    title: 'Which sink credentials do you want to edit?',
    canPickMany: false
  });
  if (!sinkKind) {return;}

  const sink = instantiateSingleSinkForKind(sinkKind);
  if (!sink?.requirements) {
    vscode.window.showWarningMessage(`No editable credentials for "${sinkKind}"`);
    return;
  }

  const setupFields = sink.requirements().filter(r => r.scope === 'setup');
  if (setupFields.length === 0) {
    vscode.window.showWarningMessage(`No setup fields to edit for "${sinkKind}"`);
    return;
  }

  const secrets = globalSecretStore(ctx);
  const cfg = vscode.workspace.getConfiguration();

  for (const spec of setupFields) {
    const existing = await readStoredValue(spec, secrets, cfg);
    const edited = await promptFieldEdit(spec, existing);
    if (edited === undefined) {
      vscode.window.showWarningMessage('Edit cancelled.');
      return;
    }
    const err = spec.validate?.(edited);
    if (err) {
      vscode.window.showErrorMessage(`${spec.label}: ${err}`);
      return;
    }
    await persistValue(spec, edited, secrets, cfg);
  }

  vscode.window.showInformationMessage(`Saved credentials for "${sinkKind}".`);
}

async function clearCredentialsCommand(ctx: vscode.ExtensionContext) {
  const which = await vscode.window.showQuickPick(['All', 'jira', 'notion', 'csv'], {
    title: 'Clear which credentials?',
    canPickMany: false
  });
  if (!which) {return;}

  const confirm = await vscode.window.showWarningMessage(
    `This will remove stored ${which === 'All' ? 'ALL' : which} credentials. Continue?`,
    { modal: true }, 'Yes', 'No'
  );
  if (confirm !== 'Yes') {return;}

  const secrets = globalSecretStore(ctx);
  const cfg = vscode.workspace.getConfiguration();

  if (which === 'All') {
    await clearAllSecrets(secrets);
    await clearKnownSettings(cfg);
  } else {
    const sink = instantiateSingleSinkForKind(which);
    const fields = sink?.requirements?.().filter(f => f.scope === 'setup') ?? [];
    for (const f of fields) {
      await deleteValue(f, secrets, cfg);
    }
  }
  vscode.window.showInformationMessage(`Cleared ${which} credentials.`);
}

// Helpers
function instantiateSingleSinkForKind(kind: string): TimeSink | undefined {
  const reg = new SinkRegistry();
  reg.register('csv',  (c) => new CsvSink(c));
  reg.register('jira', (c) => new JiraSink(c));
  reg.register('notion',(c) => new NotionSink(c));

  const baseCfg = { kind, enabled: true, options: {} };
  const all = reg.create([baseCfg as any]);
  return all[0];
}

async function readStoredValue(
  spec: FieldSpec,
  secrets: { get(k: string): Promise<string | undefined> },
  cfg: vscode.WorkspaceConfiguration
): Promise<unknown> {
  if (spec.type === 'secret') {
    const key = spec.secretKey || `clockit.${spec.key}`;
    const v = await secrets.get(key);
    if (exists(v)) {return v;}
  }
  if (spec.settingKey) {
    const v = cfg.get(spec.settingKey);
    if (exists(v)) {return v;}
  }
  const fallback = cfg.get(spec.key);
  return exists(fallback) ? fallback : undefined;
}

async function persistValue(
  spec: FieldSpec,
  value: unknown,
  secrets: { set(k: string, v: string): Promise<void> },
  cfg: vscode.WorkspaceConfiguration
) {
  if (spec.type === 'secret') {
    const key = spec.secretKey || `clockit.${spec.key}`;
    await secrets.set(key, String(value ?? ''));
    return;
  }
  const k = spec.settingKey || spec.key;
  await cfg.update(k, value, vscode.ConfigurationTarget.Workspace);
}

async function deleteValue(
  spec: FieldSpec,
  secrets: { delete(k: string): Promise<void> },
  cfg: vscode.WorkspaceConfiguration
) {
  if (spec.type === 'secret') {
    const key = spec.secretKey || `clockit.${spec.key}`;
    await secrets.delete(key).catch(() => {});
    return;
  }
  const k = spec.settingKey || spec.key;
  await cfg.update(k, undefined, vscode.ConfigurationTarget.Workspace);
}

async function clearAllSecrets(secrets: { keys(): Promise<string[]>; delete(k: string): Promise<void> }) {
  const all = await secrets.keys();
  await Promise.all(all.filter(k => k.startsWith('clockit.')).map(k => secrets.delete(k).catch(()=>{})));
}

async function clearKnownSettings(cfg: vscode.WorkspaceConfiguration) {
  const keys = [
    'clockit.jira.domain', 'clockit.jira.email',
    'clockit.notion.databaseId', 'clockit.notion.pageId',
    'clockit.enabledSinks'
  ];
  await Promise.all(keys.map(k => cfg.update(k, undefined, vscode.ConfigurationTarget.Workspace)));
}

async function promptFieldEdit(spec: FieldSpec, existing: unknown): Promise<unknown> {
  const base = {
    title: `Edit: ${spec.label}`,
    prompt: spec.description || spec.label,
    placeHolder: spec.placeholder,
    ignoreFocusOut: true,
    value: typeof existing === 'string' || typeof existing === 'number' ? String(existing) : undefined,
  };

  switch (spec.type) {
    case 'secret':
      return vscode.window.showInputBox({ ...base, password: true });
    case 'string':
      return vscode.window.showInputBox(base);
    case 'number': {
      const v = await vscode.window.showInputBox({
        ...base,
        validateInput: (s) => (isNaN(Number(s)) ? 'Enter a number' : undefined)
      });
      return exists(v) ? Number(v) : undefined;
    }
    case 'boolean': {
      const pick = await vscode.window.showQuickPick(['Yes', 'No'], {
        title: spec.label, placeHolder: spec.placeholder, ignoreFocusOut: true
      });
      return pick === 'Yes';
    }
    default:
      return vscode.window.showInputBox(base);
  }
}

function exists<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined && (typeof v !== 'string' || v.trim() !== '');
}