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
import { EventDispatcher } from './ui/EventDispatcher';
import { TestCoverageMap } from './runner/coverage/TestCoverageMap';

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

    // Construct maps for tracking test items as they are created and removed across the workspace
    const testSuiteMap = new TestSuiteMap();
    const testItemMap = new TestItemMap();
    const testTagProfileMap = new Map<string, vscode.TestRunProfile>();
    const testCoverageMap = new TestCoverageMap(logger);

    // Register events for the test item map to handle tagged tests
    testItemMap.onTestTagCreated(event => {
        // Create run profile for regular run
        let runProfile = ctrl.createRunProfile(
            'TAG: ' + event.tagId,
            vscode.TestRunProfileKind.Run,
            (request, token) => { dispatcher.handleNewTestRunRequest(request, token, false); },
            false,
            new vscode.TestTag(event.tagId),
            true
        );
        testTagProfileMap.set(event.tagId + '::RUN', runProfile);

        // Create run profile for debug run
        let debugProfile = ctrl.createRunProfile(
            'TAG: ' + event.tagId,
            vscode.TestRunProfileKind.Debug,
            (request, token) => { dispatcher.handleNewTestRunRequest(request, token, true); },
            false,
            new vscode.TestTag(event.tagId),
            false
        );
        testTagProfileMap.set(event.tagId + '::DEBUG', debugProfile);
    });
    testItemMap.onTestTagRemoved(event => {
        let runProfile = testTagProfileMap.get(event.tagId + '::RUN');
        if (runProfile) {
            runProfile.dispose();
            testTagProfileMap.delete(event.tagId + '::RUN');
        }

        let debugProfile = testTagProfileMap.get(event.tagId + '::DEBUG');
        if (debugProfile) {
            debugProfile.dispose();
            testTagProfileMap.delete(event.tagId + '::DEBUG');
        }
    });

    // Create diagnostic collection (for displaying test failures as hovers in editors)
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('php');
    context.subscriptions.push(diagnosticCollection);

    // Create test runner
    logger.trace(`Creating test runner`);
    const runner = new TestRunner(ctrl, testItemMap, testCoverageMap, diagnosticCollection, settings, logger);

    // Create test file loader
    logger.trace('Creating test file loader');
    const loader = new TestFileLoader(ctrl, testItemMap, testSuiteMap, settings, logger);

    // Create event dispatcher
    logger.trace('Creating event dispatcher');
    const dispatcher = new EventDispatcher(loader, runner, diagnosticCollection, settings);

    // Create command handler
    logger.trace(`Creating command handler`);
    const commandHandler = new CommandHandler(loader, runner, dispatcher, testItemMap, testTagProfileMap, logger);

    // Extension entry point event handlers
    ctrl.refreshHandler = async (token) => dispatcher.handleTestItemRefresh();
    ctrl.resolveHandler = async (item) => dispatcher.handleTestItemResolve(item);

    // Set up run profile
    let profileRunAll = ctrl.createRunProfile(
        'Run tests',
        vscode.TestRunProfileKind.Run,
        (request, token) => { dispatcher.handleNewTestRunRequest(request, token, false, false); },
        true,
        undefined,
        true
    );
    let profileRunAllCoverage = ctrl.createRunProfile(
        'Run tests with coverage',
        vscode.TestRunProfileKind.Coverage,
        (request, token) => { dispatcher.handleNewTestRunRequest(request, token, false, true); },
        true,
        undefined,
        true
    );
    let profileRunAllDebug = ctrl.createRunProfile(
        'Debug tests',
        vscode.TestRunProfileKind.Debug,
        (request, token) => { dispatcher.handleNewTestRunRequest(request, token, true, false); },
        true
    );

    // Register code coverage loader with appropriate run profile
    profileRunAllCoverage.loadDetailedCoverage = async (run: vscode.TestRun, coverage: vscode.FileCoverage, token: vscode.CancellationToken) => {
        return testCoverageMap.getDetailedMetrics(coverage);
    };

    // Register command handlers
    context.subscriptions.push(
        vscode.commands.registerCommand('phpunit-test-workbench.runMethod', () => commandHandler.execute('run.method')),
        vscode.commands.registerCommand('phpunit-test-workbench.runClass', () => commandHandler.execute('run.class')),
        vscode.commands.registerCommand('phpunit-test-workbench.runClassWithTag', () => commandHandler.execute('run.class.tag')),
        vscode.commands.registerCommand('phpunit-test-workbench.runSuite', () => commandHandler.execute('run.suite')),
        vscode.commands.registerCommand('phpunit-test-workbench.runSuiteWithTag', () => commandHandler.execute('run.suite.tag')),
        vscode.commands.registerCommand('phpunit-test-workbench.runAll', () => commandHandler.execute('run.all')),
        vscode.commands.registerCommand('phpunit-test-workbench.runAllWithTag', () => commandHandler.execute('run.all.tag')),
        vscode.commands.registerCommand('phpunit-test-workbench.debugMethod', () => commandHandler.execute('debug.method')),
        vscode.commands.registerCommand('phpunit-test-workbench.debugClass', () => commandHandler.execute('debug.class')),
        vscode.commands.registerCommand('phpunit-test-workbench.debugClassWithTag', () => commandHandler.execute('debug.class.tag')),
        vscode.commands.registerCommand('phpunit-test-workbench.debugSuite', () => commandHandler.execute('debug.suite')),
        vscode.commands.registerCommand('phpunit-test-workbench.debugSuiteWithTag', () => commandHandler.execute('debug.suite.tag')),
        vscode.commands.registerCommand('phpunit-test-workbench.debugAll', () => commandHandler.execute('debug.all')),
        vscode.commands.registerCommand('phpunit-test-workbench.debugAllWithTag', () => commandHandler.execute('debug.all.tag')),
        vscode.commands.registerCommand('phpunit-test-workbench.rerunLastTestRun', () => commandHandler.execute('rerun'))
    );

    // Register event handlers
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => dispatcher.handleChangedConfiguration(e)),
        vscode.workspace.onDidChangeTextDocument(e => dispatcher.handleChangedTextDocument(e)),
        vscode.workspace.onDidRenameFiles(e => dispatcher.handleRenamedFile(e)),
        vscode.workspace.onDidDeleteFiles(e => dispatcher.handleDeletedFile(e))
    );

    // Initialize workspace by scanning for configuration files and parsing currently open documents for tests
    logger.trace('Initialise workspace by reading configuration files and setting file system watchers');
    loader.initializeWorkspace();

    logger.trace('Extension "phpunit-test-workbench" activated!');
    logger.trace('');
}

// this method is called when your extension is deactivated
export function deactivate() {}