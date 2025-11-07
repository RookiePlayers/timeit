"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarAlignment = exports.commands = exports.extensions = exports.window = exports.workspace = void 0;
exports.Uri = Uri;
// Minimal VS Code API mock for unit tests
const config = {
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
exports.workspace = {
    name: 'TestWS',
    workspaceFolders: [{ uri: { fsPath: '/repo' }, name: 'repo' }],
    getConfiguration: () => ({
        get: (k) => config[k],
        update: (k, v) => (config[k] = v),
    }),
    onDidChangeTextDocument: jest.fn(),
};
exports.window = {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInputBox: jest.fn().mockResolvedValue(''), // overridable per test
    createStatusBarItem: () => ({
        text: '', tooltip: '', command: '', show: jest.fn(),
    }),
    onDidChangeActiveTextEditor: jest.fn(),
};
exports.extensions = {
    getExtension: jest.fn().mockReturnValue({
        isActive: true,
        exports: { getAPI: () => ({ repositories: [] }) },
        activate: jest.fn(),
    }),
};
exports.commands = {
    registerCommand: jest.fn(),
};
exports.StatusBarAlignment = { Left: 1, Right: 2 };
function Uri() { }
//# sourceMappingURL=vscode.js.map