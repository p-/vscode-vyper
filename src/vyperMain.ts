'use strict';

import * as vscode from 'vscode';
import { buildContract } from './vyperBuild';
import { languages, IndentAction } from 'vscode';

export const VYPER_LANG_ID = 'vyper';
export const VYPER_CONFIG_SECTION = 'vyper';
export let errorDiagnosticCollection: vscode.DiagnosticCollection;
export let warningDiagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	languages.setLanguageConfiguration(VYPER_LANG_ID, {
		onEnterRules: [
			{
				beforeText: /^\s*(?:def|class|for|if|elif|else|while|try|with|finally|except|async).*?:\s*$/,
				action: { indentAction: IndentAction.Indent }
			}
		]
	});

	errorDiagnosticCollection = vscode.languages.createDiagnosticCollection('vyper-errors');
	context.subscriptions.push(errorDiagnosticCollection);
	warningDiagnosticCollection = vscode.languages.createDiagnosticCollection('vyper-warnings');
	context.subscriptions.push(warningDiagnosticCollection);

    let disposable = vscode.commands.registerCommand('vyper.buildContract',buildContract);
	context.subscriptions.push(disposable);
	
	startBuildOnSaveWatcher(context.subscriptions);
}

function startBuildOnSaveWatcher(subscriptions: vscode.Disposable[]) {
	vscode.workspace.onDidSaveTextDocument(document => {
		if (document.languageId !== VYPER_LANG_ID) {
			return;
		}
		const vyperConfig = vscode.workspace.getConfiguration(VYPER_CONFIG_SECTION);
		if (vyperConfig['buildOnSave'] === false) {
			return;
		}
		buildContract(document.uri);
	}, null, subscriptions);
}

export function deactivate() {
}

