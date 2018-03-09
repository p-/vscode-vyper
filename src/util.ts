import vscode = require('vscode');
import path = require('path');
import cp = require('child_process');
import { outputChannel } from './vyperStatus';
import { errorDiagnosticCollection, warningDiagnosticCollection } from './vyperMain';
import * as os from 'os';

export interface ICheckResult {
	file: string;
	line: number;
	msg: string;
	severity: string;
}

/**
 * Runs the Vyper command line tool and returns errors/warnings that can be fed to the Problems Matcher
 * @param args Arguments to be passed while running given tool
 * @param cwd cwd that will passed in the env object while running given tool
 * @param severity error or warning
 * @param useStdErr If true, the stderr of the output of the given tool will be used, else stdout will be used
 * @param toolName The name of the tool to run
 * @param printUnexpectedOutput If true, then output that doesnt match expected format is printed to the output channel
 */
export function runTool(args: string[], cwd: string, severity: string, useStdErr: boolean, toolName: string, env: any, printUnexpectedOutput: boolean, token?: vscode.CancellationToken): Promise<ICheckResult[]> {
    let cmd = toolName;

	let p: cp.ChildProcess;
	if (token) {
		token.onCancellationRequested(() => {
			if (p) {
				killTree(p.pid);
			}
		});
	}
	// need to activate virtualenv first source ~/vyper-venv/bin/activate 
	return new Promise((resolve, reject) => {
		p = cp.execFile(cmd, args, { env: env, cwd: cwd }, (err, stdout, stderr) => {
			try {
				if (err && (<any>err).code === 'ENOENT') {
					console.log(`Cannot find Python to execute Vyper: ${toolName}`);
					vscode.window.showErrorMessage(`Cannot find Python to execute Vyper: ${toolName}. Please specify a virtual environment in the user settings.`);
					return resolve([]);
				}
				if (err && stderr && !useStdErr) {
					outputChannel.appendLine(['Error while running tool:', cmd, ...args].join(' '));
					outputChannel.appendLine(stderr);
					return resolve([]);
				}
				let lines = (useStdErr ? stderr : stdout).toString().split('\n');
				outputChannel.appendLine(['Finished running tool:', cmd, ...args].join(' '));

				let ret: ICheckResult[] = [];
				let unexpectedOutput = false;
				let atleastSingleMatch = false;
				for (let i = 0; i < lines.length; i++) {
					if (lines[i][0] === '\t' && ret.length > 0) {
						ret[ret.length - 1].msg += '\n' + lines[i];
						continue;
					}
					if (!lines[i].startsWith('vyper.')
						&& !lines[i].startsWith('tokenize.')
						&& !lines[i].startsWith('SyntaxError:')
						&& !lines[i].startsWith('AttributeError:')
						&& !lines[i].startsWith('Exception:')) {
						if (printUnexpectedOutput && useStdErr && stderr)
						{
							unexpectedOutput = true;
						}
						continue;
					}
					atleastSingleMatch = true;

					let checkResult: ICheckResult;
					const file = path.resolve(cwd, args[1]);

					if (lines[i].startsWith('vyper.')) {
						checkResult = vyperErrorLineToCheckResult(lines[i], file, severity);
					} else if (lines[i].startsWith('tokenize.')) {
						checkResult = pythonErrorLineToCheckResult(lines[i], file, severity);
					} else if (lines[i].startsWith('SyntaxError:')) {
						checkResult = syntaxErrorToCheckResult(lines, i, file, severity);
					} else if (lines[i].startsWith('Exception:') || lines[i].startsWith('AttributeError:')) {
						checkResult = exceptionErrorLineToCheckResult(lines[i], file, severity);
					}

					ret.push(checkResult);
					outputChannel.appendLine(`${checkResult.file}:${checkResult.line}: ${checkResult.msg}`);
				}
				if (!atleastSingleMatch && unexpectedOutput && vscode.window.activeTextEditor) {
					outputChannel.appendLine(stderr);
					if (err) {
						ret.push({
							file: vscode.window.activeTextEditor.document.fileName,
							line: 1,
							msg: stderr,
							severity: 'error'
						});
					}
				}
				outputChannel.appendLine('');
				resolve(ret);
			} catch (e) {
				reject(e);
			}
		});
	});
}

export function vyperErrorLineToCheckResult(errorLine: string, file: string, defaultSeverity: string): ICheckResult {
	//TODO error handling
	const errorParts = errorLine.split(':');

	let line = 1;
	let startSlice = 1;
	if (errorParts.length === 4)
	{
		line = parseInt(errorParts[1].trim().split(' ')[1]);
		startSlice = 2;
	}
	const msg = errorParts.slice(startSlice, errorParts.length).join(':').trim();

	return { file, line, msg, severity: defaultSeverity };
}

export function pythonErrorLineToCheckResult(errorLine: string, file: string, defaultSeverity: string): ICheckResult {
	//TODO error handling
	const errorParts = errorLine.split(':');
	const freedMessage = errorParts[1].trim().replace(/\(/g, '').replace(/'/g, '');
	const messageParts = freedMessage.split(',');

	const msg = messageParts[0];
	const line = parseInt(messageParts[1].trim());

	return { file, line, msg, severity: defaultSeverity };
}

export function syntaxErrorToCheckResult(errorLines: string[], errorLineNumber: number, file: string, defaultSeverity: string): ICheckResult {
	// Sample:
	// 	File "<unknown>", line 24
	//     def participate:
	//                    ^
	// SyntaxError: invalid syntax
	//TODO error handling
	//TODO test
	const line = parseInt(errorLines[errorLineNumber - 3].split(',')[1].trim().split(' ')[1]);
	const msg = errorLines[errorLineNumber]; 

	return { file, line, msg, severity: defaultSeverity };
}

export function exceptionErrorLineToCheckResult(errorLine: string, file: string, defaultSeverity: string): ICheckResult {
	//TODO error handling
	const errorParts = errorLine.split(':');
	const line = 1;
	const msg = errorParts.slice(1, errorParts.length).join(':').trim();

	return { file, line, msg, severity: defaultSeverity };
}

export function handleDiagnosticErrors(document: vscode.TextDocument, errors: ICheckResult[], diagnosticSeverity?: vscode.DiagnosticSeverity) {

	if (diagnosticSeverity === undefined || diagnosticSeverity === vscode.DiagnosticSeverity.Error) {
		errorDiagnosticCollection.clear();
	}
	if (diagnosticSeverity === undefined || diagnosticSeverity === vscode.DiagnosticSeverity.Warning) {
		warningDiagnosticCollection.clear();
	}

	let diagnosticMap: Map<string, Map<vscode.DiagnosticSeverity, vscode.Diagnostic[]>> = new Map();
	errors.forEach(error => {
		let canonicalFile = vscode.Uri.file(error.file).toString();
		let startColumn = 0;
		let endColumn = 1;
		if (document && document.uri.toString() === canonicalFile) {
			let range = new vscode.Range(error.line - 1, 0, error.line - 1, document.lineAt(error.line - 1).range.end.character + 1);
			let text = document.getText(range);
			endColumn = text.length;
		}
		let range = new vscode.Range(error.line - 1, startColumn, error.line - 1, endColumn);
		let severity = mapSeverityToVSCodeSeverity(error.severity);
		let diagnostic = new vscode.Diagnostic(range, error.msg, severity);
		let diagnostics = diagnosticMap.get(canonicalFile);
		if (!diagnostics) {
			diagnostics = new Map<vscode.DiagnosticSeverity, vscode.Diagnostic[]>();
		}
		if (!diagnostics[severity]) {
			diagnostics[severity] = [];
		}
		diagnostics[severity].push(diagnostic);
		diagnosticMap.set(canonicalFile, diagnostics);
	});

	diagnosticMap.forEach((diagMap, file) => {
		const fileUri = vscode.Uri.parse(file);
		if (diagnosticSeverity === undefined || diagnosticSeverity === vscode.DiagnosticSeverity.Error) {
			const newErrors = diagMap[vscode.DiagnosticSeverity.Error];
			let existingWarnings = warningDiagnosticCollection.get(fileUri);
			errorDiagnosticCollection.set(fileUri, newErrors);

			// If there are warnings on current file, remove the ones co-inciding with the new errors
			if (newErrors && existingWarnings) {
				const errorLines = newErrors.map(x => x.range.start.line);
				existingWarnings = existingWarnings.filter(x => errorLines.indexOf(x.range.start.line) === -1);
				warningDiagnosticCollection.set(fileUri, existingWarnings);
			}
		}
		if (diagnosticSeverity === undefined || diagnosticSeverity === vscode.DiagnosticSeverity.Warning) {
			const existingErrors = errorDiagnosticCollection.get(fileUri);
			let newWarnings = diagMap[vscode.DiagnosticSeverity.Warning];

			// If there are errors on current file, ignore the new warnings co-inciding with them
			if (existingErrors && newWarnings) {
				const errorLines = existingErrors.map(x => x.range.start.line);
				newWarnings = newWarnings.filter(x => errorLines.indexOf(x.range.start.line) === -1);
			}

			warningDiagnosticCollection.set(fileUri, newWarnings);
		}
	});
}

function mapSeverityToVSCodeSeverity(sev: string): vscode.DiagnosticSeverity {
	switch (sev) {
		case 'error': return vscode.DiagnosticSeverity.Error;
		case 'warning': return vscode.DiagnosticSeverity.Warning;
		default: return vscode.DiagnosticSeverity.Error;
	}
}

export function getVyperVirtualEnv(): string {
	const vyperConfig = vscode.workspace.getConfiguration('vyper', vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : null);

	if (vyperConfig['virtualEnvPath'] !== null) {
		return resolveHomeDir(vyperConfig['virtualEnvPath']);
	}
	return os.homedir() + '/vyper-venv';
}

/**
 * Expands ~ to homedir in non-Windows platform
 */
export function resolveHomeDir(inputPath: string): string {
	if (!inputPath || !inputPath.trim()) {
		return inputPath;
	} 
	return inputPath.startsWith('~') ? path.join(os.homedir(), inputPath.substr(1)) : inputPath;
}


export function killTree(processId: number): void {
	if (process.platform === 'win32') {
		const TASK_KILL = 'C:\\Windows\\System32\\taskkill.exe';

		// when killing a process in Windows its child processes are *not* killed but become root processes.
		// Therefore we use TASKKILL.EXE
		try {
			cp.execSync(`${TASK_KILL} /F /T /PID ${processId}`);
		} catch (err) {
		}
	} else {
		// on linux and OS X we kill all direct and indirect child processes as well
		try {
			const cmd = path.join(__dirname, '../../../scripts/terminateProcess.sh');
			cp.spawnSync(cmd, [processId.toString()]);
		} catch (err) {
		}
	}
}
