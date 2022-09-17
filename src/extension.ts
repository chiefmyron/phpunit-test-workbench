// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { testDataMap, getTestItemType, TestFile, ItemType } from './testTree';
import * as parser from './parser';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.info('Beginning activation of "phpunit-test-workbench" extension...\n');

	// Create test controller
	const ctrl = vscode.tests.createTestController('phpunitTestController', 'PHPUnit Test Workbench');
	context.subscriptions.push(ctrl);

	// Refresh handler
	ctrl.refreshHandler = async () => {
		await refreshTestFilesInWorkspace(ctrl);
	};

	// Resolve handler
	ctrl.resolveHandler = async item => {
		if (!item) {
			// We are being asked to discover all tests for the workspace
			await discoverTestFilesInWorkspace(ctrl);
		} else {
			// We are being asked to resolve children for the supplied TestItem
			await parseTestFileContents(item.uri!, ctrl);
		}
	};

	// Set up run profile
	ctrl.createRunProfile(
		'Run tests',
		vscode.TestRunProfileKind.Run,
		(request, token) => { runHandler(request, token, ctrl); },
		true
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => refreshTestFilesInWorkspace(ctrl)),
		vscode.workspace.onDidOpenTextDocument(doc => parseTestFileContents(doc.uri, ctrl, doc.getText())),
		vscode.workspace.onDidChangeTextDocument(e => parseTestFileContents(e.document.uri, ctrl, e.document.getText()))
	);

	// Run initial test discovery on files already present in the workspace
	console.group('Running initial test discovery for files already present in workspace:');
	for (const doc of vscode.workspace.textDocuments) {
		parseTestFileContents(doc.uri, ctrl, doc.getText());
	}
	console.groupEnd();
	console.info('Intial test discovery complete.\n');

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.info('Congratulations, your extension "phpunit-test-workbench" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('phpunit-test-workbench.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from PHPUnit Test Workbench!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function refreshTestFilesInWorkspace(controller: vscode.TestController) {
	controller.items.forEach(item => controller.items.delete(item.id));
	return discoverTestFilesInWorkspace(controller);
}

async function parseTestFileContents(uri: vscode.Uri, controller: vscode.TestController, fileContents?: string) {
	// Get setting determining test organisation structure
	const phpUnitConfig = vscode.workspace.getConfiguration('phpunit-test-workbench.phpunit');
	return await parser.parseTestFileContents(phpUnitConfig.get('testOrganization', 'file'), uri, controller, fileContents);
}

async function discoverTestFilesInWorkspace(controller: vscode.TestController) {
	// Handle the case of no open folders
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	// Get the pattern defining the test file location from configuration
	const phpUnitConfig = vscode.workspace.getConfiguration('phpunit-test-workbench.phpunit');

	return Promise.all(
		vscode.workspace.workspaceFolders.map(async workspaceFolder => {
			const pattern = new vscode.RelativePattern(workspaceFolder, phpUnitConfig.get('testsPath', '**/*.php'));
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);

			// Set file related event handlers
			watcher.onDidCreate(uri => parseTestFileContents(uri, controller));
			watcher.onDidChange(uri => parseTestFileContents(uri, controller));
			watcher.onDidDelete(uri => controller.items.delete(uri.toString()));

			// Find initial set of files for workspace
			for (const file of await vscode.workspace.findFiles(pattern)) {
				await parseTestFileContents(file, controller);
			}

			return watcher;
		})
	);
}

async function runHandler(
	request: vscode.TestRunRequest,
	token: vscode.CancellationToken,
	controller: vscode.TestController
) {
	const run = controller.createTestRun(request);
	const queue: vscode.TestItem[] = [];

	// Loop through all included tests (or all known tests if no includes specified) and add to queue
	if (request.include) {
		request.include.forEach(test => queue.push(test));
	} else {
		controller.items.forEach(test => queue.push(test));
	}

	// For every queued test, attempt to run it
	while (queue.length > 0 && !token.isCancellationRequested) {
		const test = queue.pop()!;

		// Check if the user asked to exclude this test
		if (request.exclude?.includes(test)) {
			continue;
		}

		// Check type of TestItem we are running
		switch(getTestItemType(test)) {
			case ItemType.file:
				// We are running a file - need to check if it has been parsed for test cases
				if (test.children.size <= 0) {
					await parseTestFileContents(test.uri!, controller);
				}
				break;
			case ItemType.testCase:
				// We are running a test case
				const start = Date.now();
				try {
					// TODO: Actual test execution
					run.passed(test, Date.now() - start);
				} catch (e) {
					run.failed(test, new vscode.TestMessage('Test failed!'), Date.now() - start);
				}
				break;
		}

		// If the test has any children, add them to the queue now
		test.children.forEach(test => queue.push(test));
	}

	// Mark the test run as complete
	run.end();
}
