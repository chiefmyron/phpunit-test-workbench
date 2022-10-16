// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Settings } from './settings';
import { Logger } from './output';
import { TestFileParser } from './parser/TestFileParser';
import { TestItemMap } from './parser/TestItemMap';
import { TestSuiteMap } from './suites/TestSuiteMap';
import { CommandHandler } from './ui/CommandHandler';
import { TestRunner } from './runner/TestRunner';

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
	const testFileParser = new TestFileParser(ctrl, testItemMap, testSuiteMap, settings, logger);

	// Create test runner
	logger.trace(`Creating test runner`);
	const runner = new TestRunner(ctrl, testItemMap, settings, logger);

	// Create command handler
	logger.trace(`Creating command handler`);
	const commandHandler = new CommandHandler(ctrl, testFileParser, testItemMap, runner, settings, logger);

	// Refresh handler
	ctrl.refreshHandler = async () => {
		await testFileParser.refreshTestFilesInWorkspace();
	};

	// Resolve handler
	ctrl.resolveHandler = async item => {
		if (!item) {
			// We are being asked to discover all tests for the workspace
			await testFileParser.parseTestFilesInWorkspace();
		} else {
			// We are being asked to resolve children for the supplied TestItem
			try {
				if (item.uri && item.uri.scheme === 'file') {
					let document = await vscode.workspace.openTextDocument(item.uri);
					await testFileParser.parseOpenDocument(document);
				}
			} catch (e) { }
		}
	};

	// Set up run profile
	ctrl.createRunProfile(
		'Run tests',
		vscode.TestRunProfileKind.Run,
		(request, token) => { runner.run(request, token); },
		true
	);

	// Register command handlers
	context.subscriptions.push(
		vscode.commands.registerCommand('phpunit-test-workbench.runMethod', () => commandHandler.execute('run.method')),
		vscode.commands.registerCommand('phpunit-test-workbench.runClass', () => commandHandler.execute('run.class')),
		vscode.commands.registerCommand('phpunit-test-workbench.runSuite', () => commandHandler.execute('run.suite')),
		vscode.commands.registerCommand('phpunit-test-workbench.runAll', () => commandHandler.execute('run.all'))
	);

	// Register event handlers
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => updateConfigurationSettings(settings, testFileParser)),
		vscode.workspace.onDidOpenTextDocument(document => testFileParser.parseOpenDocument(document)),
		vscode.workspace.onDidChangeTextDocument(e => testFileParser.parseOpenDocument(e.document))
	);

	// Initialize workspace by scanning for configuration files and parsing currently open documents for tests
	initializeWorkspace(logger, testFileParser);

	logger.trace('Extension "phpunit-test-workbench" activated!');
	logger.trace('');
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function initializeWorkspace(logger: Logger, testFileParser: TestFileParser) {
	// Scan workspace folders for configuration files
	logger.trace('Run initial configuration file discovery in workspace folders');
	await testFileParser.setWorkspaceFileSystemWatchers();

	// Run initial test discovery on files already present in the workspace
	logger.trace('Run initial test discovery against files already open in the workspace');
	for (const doc of vscode.workspace.textDocuments) {
		testFileParser.parseOpenDocument(doc);
	}
}

async function updateConfigurationSettings(settings: Settings, testFileParser: TestFileParser) {
	// Refresh configuration object with new settings and refresh files found in the workspace
	// (setting changes may affect the way TestItem objects are discovered and/or organized)
	settings.refresh();
	await testFileParser.refreshTestFilesInWorkspace();
}
