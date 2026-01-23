import { configTargetForKey } from '../core/config-target';

export class CsvFolderService {
   private static instance: CsvFolderService;
   private constructor(private vscode: typeof import('vscode'), private notify: (message: string, type: 'info' | 'warn' | 'error') => void) {}
   static getInstance(vscode: typeof import('vscode'), notify: (message: string, type: 'info' | 'warn' | 'error') => void) {
    if (!CsvFolderService.instance) {
      CsvFolderService.instance = new CsvFolderService(vscode, notify);
    }
    return CsvFolderService.instance;
  }

  async showCsvMenu() {
    const cfg = this.vscode.workspace.getConfiguration();
    const name = (cfg.get<string>('clockit.author.name') || '').trim();
    const email = (cfg.get<string>('clockit.author.email') || '').trim();
    const cloudEnabled = cfg.get<boolean>('clockit.cloud.enabled') && (cfg.get<string>('clockit.cloud.apiToken') || '').trim();

    const cloudLabel = cloudEnabled
      ? `$(cloud-check) Cloud: ${name || email || 'Signed in'}`
      : '$(cloud-upload) Login to Clockit Cloud';
    const cloudDescription = cloudEnabled
      ? (email || 'Cloud backup enabled')
      : 'Enable cloud backups with your API token';

    const pick = await this.vscode.window.showQuickPick(
      [
        {
          label: cloudLabel,
          description: cloudDescription,
          id: cloudEnabled ? 'noop' : 'loginCloud',
          alwaysShow: true,
        },
        { label: '$(watch) Start time', id: 'startTimer' },
        { label: '$(primitive-square) Stop time', id: 'stopTimer' },
        { label: '$(debug-pause) Pause/Resume time', id: 'pauseTimer' },
        { label: '$(clock) Set focus timer…', id: 'focusTimer' },
        {
          label: '$(cloud) Open Clockit Cloud',
          description: 'View dashboard in your browser',
          id: 'openCloud',
        },
        { label: '$(book) Open current CSV', id: 'openCurrent' },
        { label: '$(folder-opened) Open CSV folder', id: 'openFolder' },
        { label: '$(replace) Change CSV folder', id: 'changeFolder' },
        { label: '$(history) Browse past logs…', id: 'browsePast' },
      ],
      { placeHolder: 'Clockit Menu — timers, CSV, cloud', ignoreFocusOut: true }
    );
    if (!pick || pick.id === 'noop') {return;}

    switch (pick.id) {
      case 'openCurrent':
        await this.openCsvLog();
        break;
      case 'openFolder':
        await this.openCsvFolder();
        break;
      case 'changeFolder':
        await this.chooseCsvFolder();
        break;
      case 'browsePast':
        await this.browsePastLogs();
        break;
      case 'loginCloud':
        await this.promptCloudSetup();
        break;
      case 'openCloud':
        await this.openCloud();
        break;
      case 'startTimer':
        await this.vscode.commands.executeCommand('clockit.startTimeTracking');
        break;
      case 'stopTimer':
        await this.vscode.commands.executeCommand('clockit.stopTimeTracking');
        break;
      case 'pauseTimer':
        await this.vscode.commands.executeCommand('clockit.pauseTimeTracking');
        break;
      case 'focusTimer': {
        const raw = await this.vscode.window.showInputBox({
          prompt: 'Set a focus timer (mm:ss)',
          placeHolder: '25:00',
          ignoreFocusOut: true,
          validateInput: (val) => {
            const re = /^(\d{1,3}):([0-5]?\d)$/;
            if (!re.test(val.trim())) {return 'Use mm:ss (e.g., 25:00)';}
            const [, mm, ss] = val.trim().match(re) ?? [];
            const total = Number(mm) * 60 + Number(ss);
            return total > 0 ? null : 'Duration must be > 0 seconds';
          },
        });
        if (!raw) {break;}
        const match = raw.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
        if (!match) {break;}
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const totalMinutes = (minutes * 60 + seconds) / 60;
        await this.vscode.commands.executeCommand('clockit.setFocusTimer', totalMinutes);
        break;
      }
    }
  }

  async getCsvRootAndFile() {
  const cfg = this.vscode.workspace.getConfiguration();
  const outDir = (cfg.get<string>('clockit.csv.outputDirectory') || '').trim();
  const filename = cfg.get<string>('clockit.csv.filename') || 'time_log.csv';
  const path = await import('path');
  const root =
    outDir ||
    this.vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
    process.cwd();
  const full = path.join(root, filename);
  return { root, full };
}

async  openCsvFolder() {
  const { root } = await this.getCsvRootAndFile();
  const uri = this.vscode.Uri.file(root);
  await this.vscode.commands.executeCommand('revealFileInOS', uri);
}

async  browsePastLogs() {
  const { root } = await this.getCsvRootAndFile();
  const fs = await import('fs/promises');
  const path = await import('path');

  let entries: { name: string; full: string; mtime: number }[] = [];
  try {
    const files = await fs.readdir(root, { withFileTypes: true });
    const csvs = files
      .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.csv'))
      .map(async f => {
        const full = path.join(root, f.name);
        const stat = await fs.stat(full);
        return { name: f.name, full, mtime: stat.mtimeMs };
      });
    entries = await Promise.all(csvs);
    entries.sort((a, b) => b.mtime - a.mtime);
  } catch {
    this.vscode.window.showWarningMessage('CSV folder not found yet — set a folder or write your first log.');
    return;
  }

  if (!entries.length) {
    this.vscode.window.showInformationMessage('No CSV logs found in the selected folder.');
    return;
  }

  const qp = await this.vscode.window.showQuickPick(
    entries.slice(0, 50).map(e => ({
      label: e.name,
      description: new Date(e.mtime).toLocaleString(),
      full: e.full,
    })),
    { placeHolder: 'Select a CSV log to open', ignoreFocusOut: true }
  );
  if (!qp) {return;}

  const doc = await this.vscode.workspace.openTextDocument(this.vscode.Uri.file((qp as any).full));
  await this.vscode.window.showTextDocument(doc, { preview: false });
}

async openCloud() {
  await this.vscode.env.openExternal(this.vscode.Uri.parse('https://clockit.octech.dev'));
}

async  openCsvLog() {
  const { full } = await this.getCsvRootAndFile();
  const uri = this.vscode.Uri.file(full);
  try {
    const doc = await this.vscode.workspace.openTextDocument(uri);
    await this.vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    this.notify('CSV file not found yet — stop a session first to create it.', 'warn');
  }
}

async  chooseCsvFolder() {
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
  await cfg.update('clockit.csv.outputDirectory', folderUri.fsPath, configTargetForKey('clockit.csv.outputDirectory'));

  const ensure = cfg.get<boolean>('clockit.csv.ensureDirectory') ?? true;
  if (ensure) {
    const fs = await import('fs/promises');
    await fs.mkdir(folderUri.fsPath, { recursive: true }).catch(() => {});
  }
  const choice = await this.vscode.window.showInformationMessage(
    `Clockit CSV folder set to: ${folderUri.fsPath}`,
    'Login to Clockit Cloud',
    'Close'
  );
  if (choice === 'Login to Clockit Cloud') {
    await this.promptCloudSetup();
  }
}

  private async promptCloudSetup() {
    const cfg = this.vscode.workspace.getConfiguration();
    if (!this.ensureCloudConfigRegistered(cfg)) {return;}

    const defaultUrl = (process.env.CLOCKIT_INGEST_URL || '').trim() || (cfg.get<string>('clockit.cloud.apiUrl') || '').trim() || "https://ingestcsv-ie4o3wu3ta-ey.a.run.app";
    if (!defaultUrl) {
      this.vscode.window.showErrorMessage('Clockit ingest URL is missing. Set CLOCKIT_INGEST_URL in your environment or configure clockit.cloud.apiUrl manually.');
      return;
    }

  const apiToken = await this.vscode.window.showInputBox({
    title: 'Clockit API Token',
    prompt: 'Paste the API token from the Clockit dashboard (Profile → API Tokens)',
    password: true,
    ignoreFocusOut: true,
    value: (cfg.get<string>('clockit.cloud.apiToken') || '').trim(),
  });
  if (!apiToken) {return;}

  // Optional override for ingest URL (only if user wants to change from default)
  const customUrl = await this.vscode.window.showInputBox({
    title: 'Clockit Ingest URL (optional)',
    prompt: 'Only set this if you need to override the default ingest URL (leave blank to use default).',
    ignoreFocusOut: true,
    value: defaultUrl,
  });

  await cfg.update('clockit.cloud.apiUrl', (customUrl || defaultUrl).trim(), this.vscode.ConfigurationTarget.Global);
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

}
