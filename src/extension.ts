// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Configuration } from './config';
import { Logger } from './output';
import { TestFileParser } from './parser/TestFileParser';
import { TestItemMap } from './parser/TestItemMap';
import { CommandHandler } from './runner/CommandHandler';
import { TestRunner } from './runner/TestRunner';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Load configuration from settings
	const config = new Configuration();

	// Retrieve machine level settings
	const settings = vscode.workspace.getConfiguration('phpunit-test-workbench');
	const settingTestOrgMethod = settings.get('phpunit.testOrganization', 'file');

	// Create new logger
	const logger = new Logger(config);
	logger.trace('Beginning activation of "phpunit-test-workbench" extension...');

	// Create test controller
	logger.trace('Creating test controller');
	const ctrl = vscode.tests.createTestController('phpunitTestController', 'PHPUnit Test Workbench');
	context.subscriptions.push(ctrl);

	// Create map of test items
	logger.trace('Creating map of test item data');
	const itemMap = new TestItemMap();

	// Create test file parser
	logger.trace(`Creating test file parser (test organization method: ${settingTestOrgMethod})`);
	const parser = new TestFileParser(ctrl, itemMap, config, logger);

	// Create test runner
	logger.trace(`Creating test runner`);
	const runner = new TestRunner(ctrl, itemMap, config, logger);

	// Create command handler
	logger.trace(`Creating command handler`);
	const commandHandler = new CommandHandler(ctrl, parser, itemMap, runner, config, logger);

	// Refresh handler
	ctrl.refreshHandler = async () => {
		await parser.refreshTestFilesInWorkspace();
	};

	// Resolve handler
	ctrl.resolveHandler = async item => {
		if (!item) {
			// We are being asked to discover all tests for the workspace
			await parser.discoverTestFilesInWorkspace();
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
		vscode.workspace.onDidChangeConfiguration(e => updateConfigurationSettings(config, parser)),
		vscode.workspace.onDidOpenTextDocument(doc => parser.parseOpenDocument(doc, config)),
		vscode.workspace.onDidChangeTextDocument(e => parser.parseOpenDocument(e.document, config))
	);

	// Run initial test discovery on files already present in the workspace
	logger.trace('Run initial test discovery against files already open in the workspace');
	for (const doc of vscode.workspace.textDocuments) {
		parser.parseOpenDocument(doc, config);
	}

	logger.trace('Extension "phpunit-test-workbench" activated!');
	logger.trace('');
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function updateConfigurationSettings(config: Configuration, parser: TestFileParser) {
	// Refresh configuration object with new settings and refresh files found in the workspace
	// (setting changes may affect the way TestItem objects are discovered and/or organized)
	config.refresh();
	parser.refreshTestFilesInWorkspace();
}
