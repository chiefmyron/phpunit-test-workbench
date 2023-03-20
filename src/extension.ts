// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Settings } from './settings';
import { Logger } from './output';
import { TestItemMap } from './loader/tests/TestItemMap';
import { TestSuiteMap } from './loader/suites/TestSuiteMap';
import { CommandHandler } from './ui/CommandHandler';
import { TestRunner } from './runner/TestRunner';
import { TestFileLoader } from './loader/TestFileLoader';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Load configuration from settings
	const settings = new Settings();

	// Create new logger
	const logger = new Logger(settings);
	logger.trace('Beginning activation of "phpunit-test-workbench" extension...');

	// Create test controller
	logger.trace('Creating test controller');
	const ctrl = vscode.tests.createTestController('phpunitTestController', 'PHPUnit Test Workbench');
	context.subscriptions.push(ctrl);

	// Create test file parser
	logger.trace('Creating test file parser');
	const testItemMap = new TestItemMap();
	const testSuiteMap = new TestSuiteMap();
	const testFileLoader = new TestFileLoader(ctrl, testItemMap, testSuiteMap, settings, logger);

	// Create diagnostic collection (for displaying test failures as hovers in editors)
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('php');
	context.subscriptions.push(diagnosticCollection);

	// Create test runner
	logger.trace(`Creating test runner`);
	const runner = new TestRunner(ctrl, testItemMap, diagnosticCollection, settings, logger);

	// Create command handler
	logger.trace(`Creating command handler`);
	const commandHandler = new CommandHandler(testFileLoader, testItemMap, runner, logger);

	// Refresh handler
	ctrl.refreshHandler = async () => {
		diagnosticCollection.clear();
		testFileLoader.resetWorkspace();
	};

	// Resolve handler
	ctrl.resolveHandler = async item => {
		if (!item) {
			// We are being asked to discover all tests for the workspace
			await testFileLoader.parseWorkspaceTestFiles();
		} else {
			// We are being asked to resolve children for the supplied TestItem
			try {
				if (item.uri && item.uri.scheme === 'file') {
					let document = await vscode.workspace.openTextDocument(item.uri);
					await testFileLoader.parseTestDocument(document);
				}
			} catch (e) { }
		}
	};

	// Set up run profile
	ctrl.createRunProfile(
		'Run tests',
		vscode.TestRunProfileKind.Run,
		(request, token) => { runner.run(request, token, false); },
		true
	);
	ctrl.createRunProfile(
		'Debug tests',
		vscode.TestRunProfileKind.Debug,
		(request, token) => { runner.run(request, token, true); },
		true
	);

	// Register command handlers
	context.subscriptions.push(
		vscode.commands.registerCommand('phpunit-test-workbench.runMethod', () => commandHandler.execute('run.method')),
		vscode.commands.registerCommand('phpunit-test-workbench.runClass', () => commandHandler.execute('run.class')),
		vscode.commands.registerCommand('phpunit-test-workbench.runSuite', () => commandHandler.execute('run.suite')),
		vscode.commands.registerCommand('phpunit-test-workbench.runAll', () => commandHandler.execute('run.all')),
		vscode.commands.registerCommand('phpunit-test-workbench.debugMethod', () => commandHandler.execute('debug.method')),
		vscode.commands.registerCommand('phpunit-test-workbench.debugClass', () => commandHandler.execute('debug.class')),
		vscode.commands.registerCommand('phpunit-test-workbench.debugSuite', () => commandHandler.execute('debug.suite')),
		vscode.commands.registerCommand('phpunit-test-workbench.debugAll', () => commandHandler.execute('debug.all'))
	);

	// Register event handlers
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => updateConfigurationSettings(settings, testFileLoader)),
		vscode.workspace.onDidOpenTextDocument(document => testFileLoader.parseOpenDocument(document)),
		vscode.workspace.onDidChangeTextDocument(e => testFileLoader.parseOpenDocument(e.document))
	);

	// Initialize workspace by scanning for configuration files and parsing currently open documents for tests
	initializeWorkspace(logger, testFileLoader);

	logger.trace('Extension "phpunit-test-workbench" activated!');
	logger.trace('');
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function initializeWorkspace(logger: Logger, testFileLoader: TestFileLoader) {
	// Scan workspace folders for configuration files
	logger.trace('Initialise workspace by reading configuration files and setting file system watchers');
	await testFileLoader.initializeWorkspace();

	// Run initial test discovery on files already present in the workspace
	logger.trace('Run initial test discovery against files already open in the workspace');
	for (const doc of vscode.workspace.textDocuments) {
		testFileLoader.parseOpenDocument(doc);
	}
}

async function updateConfigurationSettings(settings: Settings, testFileLoader: TestFileLoader) {
	// Refresh configuration object with new settings and refresh files found in the workspace
	// (setting changes may affect the way TestItem objects are discovered and/or organized)
	settings.refresh();
	await testFileLoader.resetWorkspace();
}
