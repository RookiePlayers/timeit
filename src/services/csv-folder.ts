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
        const pick = await this.vscode.window.showQuickPick(
            [
                { label: '$(book) Open current CSV', id: 'openCurrent' },
      { label: '$(folder-opened) Open CSV folder', id: 'openFolder' },
      { label: '$(replace) Change CSV folder', id: 'changeFolder' },
      { label: '$(history) Browse past logs…', id: 'browsePast' },
    ],
    { placeHolder: 'TimeIt — CSV actions', ignoreFocusOut: true }
  );
  if (!pick) {return;}

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
  }
}

async getCsvRootAndFile() {
  const cfg = this.vscode.workspace.getConfiguration();
  const outDir = (cfg.get<string>('timeit.csv.outputDirectory') || '').trim();
  const filename = cfg.get<string>('timeit.csv.filename') || 'time_log.csv';
  const path = await import('path');
  const os = await import('os');
  const root =
    outDir ||
    this.vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
    path.join(os.homedir(), '.timeit');
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
    openLabel: 'Use this folder for TimeIt CSV',
    defaultUri: this.vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!selection || selection.length === 0) {return;}

  const folderUri = selection[0];
  const cfg = this.vscode.workspace.getConfiguration();
  await cfg.update('timeit.csv.outputDirectory', folderUri.fsPath, this.vscode.ConfigurationTarget.Workspace);

  const ensure = cfg.get<boolean>('timeit.csv.ensureDirectory') ?? true;
  if (ensure) {
    const fs = await import('fs/promises');
    await fs.mkdir(folderUri.fsPath, { recursive: true }).catch(() => {});
  }
  this.vscode.window.showInformationMessage(`TimeIt CSV folder set to: ${folderUri.fsPath}`);
}
}