import * as vscode from 'vscode';

const GLOBAL_SETTING_KEYS = new Set<string>([
  'clockit.csv.outputDirectory',
  'clockit.jira.domain',
  'clockit.jira.email',
]);

export function configTargetForKey(key?: string): vscode.ConfigurationTarget {
  if (key && GLOBAL_SETTING_KEYS.has(key)) {
    return vscode.ConfigurationTarget.Global;
  }
  return vscode.ConfigurationTarget.Workspace;
}
