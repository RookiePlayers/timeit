import * as vscode from 'vscode';
import { makeSession, roundSession } from '../core/sessions';
import { Pipeline } from '../core/pipeline';
import type { Session } from '../core/types';
import { Utils } from '../utils';

export function registerSessionCommands(ctx: vscode.ExtensionContext, utils: Utils) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('timeit.startTimeTracking', () => startSession(utils)),
    vscode.commands.registerCommand('timeit.stopTimeTracking',  () => stopSession(utils)),
    vscode.commands.registerCommand('timeit.toggle',            () => toggleSession(utils)),

    // Back-compat
    vscode.commands.registerCommand('timeit.start',             () => startSession(utils)),
    vscode.commands.registerCommand('timeit.stop',              () => stopSession(utils)),

    // Mark activity
    vscode.workspace.onDidChangeTextDocument(() => utils.markActivity()),
    vscode.window.onDidChangeActiveTextEditor(() => utils.markActivity()),
  );
}

async function startSession(utils: Utils) {
  if (utils.isRunning()) {return;}
  utils.beginSession();
  utils.notify('TimeIt started.');
}

async function stopSession(utils: Utils) {
  if (!utils.isRunning()) {return;}

  const ended = utils.endSession();

  // Base session (idle already discounted by Utils)
  let session = makeSession({
    startedIso: ended.startedIso,
    durationSeconds: ended.durationSeconds,
    workspace: vscode.workspace.name,
    repoPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  });

  // Optional comment
  const comment = await vscode.window.showInputBox({
    prompt: 'Session comment (optional)',
    placeHolder: 'Describe what you worked on...',
    ignoreFocusOut: true,
  });
  session.comment = comment ?? '';

  // Git context + issue key detection
  const { branch, repoPath, workspaceName } = await getGitContext();
  session.branch = branch;
  session.repoPath = repoPath;
  session.workspace = workspaceName;
  session.issueKey = extractIssueKey(`${branch ?? ''} ${comment ?? ''}`) ?? null;

  // Round to 5m with 60s floor
  const pipeline = new Pipeline().use(s => roundSession(s, 300, 60));
  const finalSession = await pipeline.run(session);

  // Hand over to export flow
  await vscode.commands.executeCommand('timeit._exportSession', finalSession);
}

function toggleSession(utils: Utils) {
  utils.isRunning()
    ? vscode.commands.executeCommand('timeit.stopTimeTracking')
    : vscode.commands.executeCommand('timeit.startTimeTracking');
}

async function getGitContext() {
  try {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt) {return { branch: null, repoPath: undefined, workspaceName: vscode.workspace.name };}
    const api = gitExt.isActive ? gitExt.exports : await gitExt.activate();
    const repo = api.getAPI(1).repositories[0];
    return {
      branch: repo?.state?.HEAD?.name ?? null,
      repoPath: repo?.rootUri?.fsPath,
      workspaceName: vscode.workspace.name,
    };
  } catch {
    return { branch: null, repoPath: undefined, workspaceName: vscode.workspace.name };
  }
}

function extractIssueKey(s: string): string | null {
  const re = /(?:^|[^A-Z0-9])([A-Z][A-Z0-9]+-\d+)(?:$|[^A-Z0-9])/i;
  const m = s?.match(re);
  const key = m?.[1] || m?.[0] || null;
  return key ? key.toUpperCase() : null;
}