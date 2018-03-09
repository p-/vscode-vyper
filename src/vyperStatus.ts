'use strict';

import vscode = require('vscode');
import { VYPER_LANG_ID } from './vyperMain';

export let outputChannel = vscode.window.createOutputChannel('Vyper');

export let diagnosticsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

let statusBarEntry: vscode.StatusBarItem;

export const VYPER_MODE: vscode.DocumentFilter = { language: VYPER_LANG_ID, scheme: 'file' };

export function showHideStatus() {
	if (!statusBarEntry) {
		return;
	}
	if (!vscode.window.activeTextEditor) {
		statusBarEntry.hide();
		return;
	}
	if (vscode.languages.match(VYPER_MODE, vscode.window.activeTextEditor.document)) {
		statusBarEntry.show();
		return;
	}
	statusBarEntry.hide();
}
