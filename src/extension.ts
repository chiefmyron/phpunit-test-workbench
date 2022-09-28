// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { testDataMap, TestFileParser } from './parser/TestFileParser';
import { ItemType } from './parser/TestItemDefinition';
import { TestRunner } from './runner/TestRunner';
import { TestRunResultItem, TestRunResultStatus } from './runner/TestRunResultItem';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.info('Beginning activation of "phpunit-test-workbench" extension...\n');

	// Create test controller
	const ctrl = vscode.tests.createTestController('phpunitTestController', 'PHPUnit Test Workbench');
	context.subscriptions.push(ctrl);

	// Create test file parser
	const parser = new TestFileParser(ctrl);
	parser.setTestOrganisationMode(vscode.workspace.getConfiguration('phpunit-test-workbench.phpunit').get('testOrganization', 'file'));

	// Refresh handler
	ctrl.refreshHandler = async () => {
		await refreshTestFilesInWorkspace(parser);
	};

	// Resolve handler
	ctrl.resolveHandler = async item => {
		if (!item) {
			// We are being asked to discover all tests for the workspace
			await discoverTestFilesInWorkspace(parser);
		} else {
			// We are being asked to resolve children for the supplied TestItem
			let workspaceUri = vscode.workspace.getWorkspaceFolder(item.uri!)?.uri;
			await parser.parseTestFileContents(workspaceUri!, item.uri!);
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
		vscode.workspace.onDidChangeConfiguration(e => refreshTestFilesInWorkspace(parser)),
		vscode.workspace.onDidOpenTextDocument(doc => parseOpenDocument(parser, doc)),
		vscode.workspace.onDidChangeTextDocument(e => parseOpenDocument(parser, e.document))
	);

	// Run initial test discovery on files already present in the workspace
	console.group('Running initial test discovery for files already present in workspace:');
	for (const doc of vscode.workspace.textDocuments) {
		parseOpenDocument(parser, doc);
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

async function parseOpenDocument(parser: TestFileParser, document: vscode.TextDocument) {
	let workspaceUri = vscode.workspace.getWorkspaceFolder(document.uri)?.uri;
	parser.parseTestFileContents(workspaceUri!, document.uri, document.getText());
}

async function refreshTestFilesInWorkspace(parser: TestFileParser) {
	// Ensure file organisation setting is up to date before refreshing test files
	const phpUnitConfig = vscode.workspace.getConfiguration('phpunit-test-workbench.phpunit');
	parser.setTestOrganisationMode(phpUnitConfig.get('testOrganization', 'file'));

	// Clear any existing TestItems and re-parse files in the workspace
	parser.clearTestControllerItems();
	return discoverTestFilesInWorkspace(parser);
}

async function discoverTestFilesInWorkspace(parser: TestFileParser) {
	// Handle the case of no open folders
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	// Get the pattern defining the test file location from configuration
	const phpUnitConfig = vscode.workspace.getConfiguration('phpunit-test-workbench.phpunit');

	return Promise.all(
		vscode.workspace.workspaceFolders.map(async workspaceFolder => {
			const patternString = phpUnitConfig.get('locatorPatternTests', '{test,tests,Test,Tests}/**/*Test.php');
			const pattern = new vscode.RelativePattern(workspaceFolder, patternString);
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);

			// Set file related event handlers
			watcher.onDidCreate(fileUri => parser.parseTestFileContents(workspaceFolder.uri, fileUri));
			watcher.onDidChange(fileUri => parser.parseTestFileContents(workspaceFolder.uri, fileUri));
			watcher.onDidDelete(fileUri => parser.ctrl.items.delete(fileUri.toString()));

			// Find initial set of files for workspace
			for (const fileUri of await vscode.workspace.findFiles(pattern)) {
				await parser.parseTestFileContents(workspaceFolder.uri, fileUri);
			}

			return watcher;
		})
	);
}

function buildTestRunQueue(run: vscode.TestRun, queue: Map<string, vscode.TestItem>, item: vscode.TestItem) {
	// Mark the test as running
	run.started(item);
	
	// Add to the queue for later lookup by ID
	queue.set(item.id, item);
	item.children.forEach(child => buildTestRunQueue(run, queue, child));
	return queue;
}

async function runHandler(
	request: vscode.TestRunRequest,
	token: vscode.CancellationToken,
	controller: vscode.TestController
) {
	const run = controller.createTestRun(request);
	const queue = new Map<string, vscode.TestItem>();
	const runner = new TestRunner();

	// Get details of the first TestItem in the request (this should be the parent)
	let parentTestItem: vscode.TestItem;
	let testRunResults: TestRunResultItem[] = [];
	if (request.include) {
		// Run specific subset of tests
		parentTestItem = request.include[0]!;
		buildTestRunQueue(run, queue, parentTestItem);

		// Get the workspace folder and settings for the parent test
		let parentTestItemDef = testDataMap.get(parentTestItem)!;
		let workspaceFolder = vscode.workspace.getWorkspaceFolder(parentTestItemDef!.getWorkspaceFolderUri());
		if (!workspaceFolder) {
			console.warn(`Unable to locate workspace folder for ${parentTestItemDef.getWorkspaceFolderUri()}`);
			return;
		}

		// Determine whether we are running for a folder, class or method within a class
		let args = new Map<string, string>();
		if (parentTestItemDef.getType() === ItemType.folder) {
			runner.setPhpUnitTargetPath(parentTestItemDef.getPhpUnitId());
		} else if (parentTestItemDef.getType() === ItemType.class) {
			runner.setPhpUnitTargetPath(parentTestItem.uri!.fsPath);
		} else if (parentTestItemDef.getType() === ItemType.method) {
			args.set('--filter', '\'' + parentTestItemDef.getPhpUnitId().replace(/\\/g, "\\\\") + '\'');
		}

		testRunResults = await runner.runCommand(workspaceFolder, args);
	} else {
		// Run all top-level test items, and their children
		let runRequired: boolean = false;
		let currentWorkspaceFolder: vscode.WorkspaceFolder | undefined;
		for (let [key, item] of controller.items) {
			let itemDef = testDataMap.get(item);
			let workspaceFolder = vscode.workspace.getWorkspaceFolder(itemDef!.getWorkspaceFolderUri());
			if (currentWorkspaceFolder && workspaceFolder !== currentWorkspaceFolder) {
				// Execute any tests from the current workspace
				let results = await runner.runCommand(currentWorkspaceFolder, new Map<string, string>());
				testRunResults = testRunResults.concat(results);
				runRequired = false;
			} else {
				// Set this as the current workspace folder and start building up the test run queue
				currentWorkspaceFolder = workspaceFolder;
				buildTestRunQueue(run, queue, item);
				runRequired = true;
			}
		};

		// Clean up final run if required
		if (runRequired === true && currentWorkspaceFolder) {
			let results = await runner.runCommand(currentWorkspaceFolder, new Map<string, string>());
			testRunResults = testRunResults.concat(results);
		}
	}

	// Loop through test run results and set status and message for related TestItems
	for (const result of testRunResults) {
		let item = queue.get(result.getTestItemId());
		if (!item) {
			continue;
		}

		// Set status, duration and messages
		let message;
		switch (result.getStatus()) {
			case TestRunResultStatus.passed:
				run.passed(item, result.getDuration());
				break;
			case TestRunResultStatus.failed:
				// Format failure message
				message = new vscode.MarkdownString('**' + result.getMessage() + '**');
				if (result.getMessageDetail().length > 0) {
					message.appendMarkdown('\n' + result.getMessageDetail().replace("|n", "\n"));
				}
				run.failed(item, new vscode.TestMessage(message), result.getDuration());
				break;
			case TestRunResultStatus.ignored:
				// Format ignore message
				message = new vscode.MarkdownString('**' + result.getMessage() + '**');
				if (result.getMessageDetail().length > 0) {
					message.appendMarkdown('\n' + result.getMessageDetail().replace("|n", "\n"));
				}
				run.skipped(item);
				break;
		}
	}

	// Mark the test run as complete
	run.end();
}
