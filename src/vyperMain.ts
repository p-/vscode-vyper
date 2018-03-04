'use strict';

import * as vscode from 'vscode';
import { buildContract } from './vyperBuild';
import { languages, IndentAction } from 'vscode';

export let errorDiagnosticCollection: vscode.DiagnosticCollection;
export let warningDiagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	languages.setLanguageConfiguration('vyper', {
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
}

export function deactivate() {
}

