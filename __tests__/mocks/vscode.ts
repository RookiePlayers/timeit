// Minimal VS Code API mock for unit tests
const config: Record<string, any> = {
  'clockit.csv.outputDirectory': '',
  'clockit.csv.filename': 'time_log.csv',
  'clockit.csv.addHeaderIfMissing': true,
  'clockit.enableJira': false,
  'clockit.jira.domain': '',
  'clockit.jira.email': '',
  'clockit.jira.apiToken': '',
  'clockit.notion.enableNotion': false,
  'clockit.notion.apiToken': '',
  'clockit.notion.databaseId': '',
  'clockit.notion.pageId': '',
  'clockit.idleTimeoutMinutes': 5,
  'clockit.showNotifications': false,
};

export const workspace: any = {
  name: 'TestWS',
  workspaceFolders: [{ uri: { fsPath: '/repo' }, name: 'repo' }],
  getConfiguration: () => ({
    get: (k: string) => config[k],
    update: (k: string, v: any) => (config[k] = v),
  }),
  onDidChangeTextDocument: jest.fn(),
};

export const window: any = {
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showInputBox: jest.fn().mockResolvedValue(''), // overridable per test
  createStatusBarItem: () => ({
    text: '', tooltip: '', command: '', show: jest.fn(),
  }),
  onDidChangeActiveTextEditor: jest.fn(),
};

export const extensions: any = {
  getExtension: jest.fn().mockReturnValue({
    isActive: true,
    exports: { getAPI: () => ({ repositories: [] }) },
    activate: jest.fn(),
  }),
};

export const commands: any = {
  registerCommand: jest.fn(),
};

export const StatusBarAlignment = { Left: 1, Right: 2 };

export function Uri() {}