// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Configuration } from './config';
import { Logger } from './output';
import { TestFileParser } from './parser/TestFileParser';
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

	// Create test file parser
	logger.trace(`Creating test file parser (test organization method: ${settingTestOrgMethod})`);
	const parser = new TestFileParser(ctrl, config, logger);

	// Create test runner
	logger.trace(`Creating test runner`);
	const runner = new TestRunner(ctrl, config, logger);

	// Create command handler
	logger.trace(`Creating command handler`);
	const commandHandler = new CommandHandler(ctrl, parser, runner, config, logger);

	// Refresh handler
	ctrl.refreshHandler = async () => {
		await refreshTestFilesInWorkspace(parser);
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
		vscode.workspace.onDidOpenTextDocument(doc => parseOpenDocument(parser, doc)),
		vscode.workspace.onDidChangeTextDocument(e => parseOpenDocument(parser, e.document))
	);

	// Run initial test discovery on files already present in the workspace
	logger.trace('Run initial test discovery against files already open in the workspace');
	for (const doc of vscode.workspace.textDocuments) {
		parseOpenDocument(parser, doc);
	}

	logger.trace('Extension "phpunit-test-workbench" activated!');
	logger.trace('');
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function updateConfigurationSettings(config: Configuration, parser: TestFileParser) {
	// Refresh configuration object with new settings
	config.refresh();

	// Refresh test files found in the workspace (in case setting affects the way files are found / organized)
	refreshTestFilesInWorkspace(parser);
}

async function parseOpenDocument(parser: TestFileParser, document: vscode.TextDocument) {
	let workspaceUri = vscode.workspace.getWorkspaceFolder(document.uri)?.uri;
	parser.parseTestFileContents(workspaceUri!, document.uri, document.getText());
}

async function refreshTestFilesInWorkspace(parser: TestFileParser) {
	// Clear any existing TestItems and re-parse files in the workspace
	parser.clearTestControllerItems();
	return parser.discoverTestFilesInWorkspace();
}
