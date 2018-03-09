import path = require('path');
import vscode = require('vscode');
import { runTool, ICheckResult, handleDiagnosticErrors, getVyperVirtualEnv } from './util';
import { outputChannel } from './vyperStatus';
import { diagnosticsStatusBarItem } from './vyperStatus';
import { VYPER_LANG_ID, VYPER_CONFIG_SECTION } from './vyperMain';

export function buildContract(vyperFileUri?: vscode.Uri) {
	const documentUri = vyperFileUri ? vyperFileUri : getActiveTextEditorUri();
	let vyperConfig = vscode.workspace.getConfiguration(VYPER_CONFIG_SECTION, documentUri);

	let editor = vscode.window.activeTextEditor;
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

function getActiveTextEditorUri(): vscode.Uri {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active, cannot find current file to build');
		return null;
	}
	if (editor.document.languageId !== VYPER_LANG_ID) {
		vscode.window.showInformationMessage('File in the active editor is not a Vyper file.');
		return null;
	}

	return editor ? editor.document.uri : null;
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

	const cwd = path.dirname(fileUri.fsPath);
	if (!path.isAbsolute(cwd)) {
		return Promise.resolve([]);
	}

	running = true;

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
