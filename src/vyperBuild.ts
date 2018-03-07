import path = require('path');
import vscode = require('vscode');
import { runTool, ICheckResult, handleDiagnosticErrors, getVyperVirtualEnv } from './util';
import { outputChannel } from './vyperStatus';
import { diagnosticsStatusBarItem } from './vyperStatus';

export function buildContract() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active, cannot find current file to build');
		return;
	}
	if (editor.document.languageId !== 'vyper') {
		vscode.window.showInformationMessage('File in the active editor is not a Vyper file.');
		return;
	}

	let documentUri = editor ? editor.document.uri : null;
	let vyperConfig = vscode.workspace.getConfiguration('vyper', documentUri);

	outputChannel.clear(); // Ensures stale output from build on save is cleared
	diagnosticsStatusBarItem.show();
	diagnosticsStatusBarItem.text = 'Building...';

	vyperBuild(documentUri, vyperConfig)
		.then(errors => {
			handleDiagnosticErrors(editor ? editor.document : null, errors, vscode.DiagnosticSeverity.Error);
			diagnosticsStatusBarItem.hide();
		})
		.catch(err => {
			vscode.window.showInformationMessage('Error: ' + err);
			diagnosticsStatusBarItem.text = 'Building Failed';
		});
}

/**
 * Builds the contract and presents the output in the 'vyper' channel and in the diagnostic collections.
 *
 * @param fileUri Document uri.
 * @param vyperConfig Configuration for the Vyper extension.
 */
export function vyperBuild(fileUri: vscode.Uri, vyperConfig: vscode.WorkspaceConfiguration): Promise<ICheckResult[]> {
	if (running) {
		tokenSource.cancel();
	}

	// Calls Vyper with virtual env: /Users/sectests/vyper-venv/bin/python /usr/local/bin/vyper (which vyper?)
	const cwd = path.dirname(fileUri.fsPath);
	if (!path.isAbsolute(cwd)) {
		return Promise.resolve([]);
	}

	running = true;

	//TODO get Env and Vyper Exec from config if configured
	const pythonFromVirtualEnv = getVyperVirtualEnv() + '/bin/python';
	const vyperExec = getVyperVirtualEnv() + '/bin/vyper';

	const index = fileUri.path.lastIndexOf("/") + 1;
	const fileName = fileUri.path.substr(index);

	const args = [vyperExec, fileName];

	const buildPromise = runTool(
		args,
		cwd,
		'error',
		true,
		pythonFromVirtualEnv,
		null,
		true,
		tokenSource.token
	).then((result) => {
		running = false;
		return result;
	});
	return buildPromise;
}

let tokenSource = new vscode.CancellationTokenSource();
let running = false;
