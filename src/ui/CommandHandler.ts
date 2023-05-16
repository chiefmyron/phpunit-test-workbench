import * as vscode from 'vscode';
import { Logger } from "../output";
import { TestItemQuickPickItem } from './TestItemQuickPickItem';
import { TestFileLoader } from '../loader/TestFileLoader';
import { TestItemMap } from '../loader/tests/TestItemMap';
import { TestRunner } from "../runner/TestRunner";
import { ItemType } from '../loader/tests/TestItemDefinition';

export class CommandHandler {
    private loader: TestFileLoader;
    private itemMap: TestItemMap;
    private runner: TestRunner;
    private logger: Logger;

    constructor(
        loader: TestFileLoader,
        itemMap: TestItemMap,
        runner: TestRunner,
        logger: Logger
    ) {
        this.loader = loader;
        this.itemMap = itemMap;
        this.runner = runner;
        this.logger = logger;
    }

    public async execute(command: string) {
        const editor = vscode.window.activeTextEditor;
        let testItem: vscode.TestItem | undefined;
        let includes: vscode.TestItem[];
        let request: vscode.TestRunRequest;
        let cancellationTokenSource = new vscode.CancellationTokenSource();

        // Set debug flag
        let debug = false;
        let commandTypeDesc = 'Run';
        if (command.startsWith('debug')) {
            debug = true;
            commandTypeDesc = 'Debug';
        }

        switch (command) {
            case 'run.method':
            case 'debug.method':
                this.logger.info(`Running command: ${commandTypeDesc} test method...`);

                // Identify the file open in the active editor
                if (!editor) {
                    this.logger.warn(`No active editor found - cannot identify class to run!`, true);
                    return;
                }
                if (editor.document.languageId !== 'php') {
                    this.logger.warn(`This command can only be executed on a PHPUnit test class (*.php file). If you have a PHPUnit test class open, make sure it is the active editor by clicking in it and then try again.`, true);
                    return;
                }

                // Find test item definition for a method at the current cursor position
                testItem = this.itemMap.getTestItemForFilePosition(editor.document.uri, editor.selection.active, ItemType.method);
                if (!testItem) {
                    this.logger.warn(`Unable to find a test item definition for a method at the current cursor position. Aborting test run.`, true);
                    return;
                }

                // Create test run request
                includes = [ testItem ];
                request = new vscode.TestRunRequest(includes);
                await this.runner.run(request, cancellationTokenSource.token, debug);
                this.logger.info(`Command complete: ${commandTypeDesc} test method`);
                break;
            case 'run.class':
            case 'debug.class':
                this.logger.info(`Running command: ${commandTypeDesc} test class...`);

                // Identify the file open in the active editor
                if (!editor) {
                    this.logger.warn(`No active editor found - cannot identify class to run!`, true);
                    return;
                }
                if (editor.document.languageId !== 'php') {
                    this.logger.warn(`This command can only be executed on a PHPUnit test class. If you have a PHPUnit test class open, make sure it is the active editor by clicking in it and then try again.`, true);
                    return;
                }

                // Find test item definition for a class at the current cursor position
                testItem = this.itemMap.getTestItemForFilePosition(editor.document.uri, editor.selection.active, ItemType.class);
                if (!testItem) {
                    this.logger.warn(`Unable to find a test item definition for a class at the current cursor position. Aborting test run.`, true);
                    return;
                }
                
                // Create test run request
                includes = [ testItem ];
                request = new vscode.TestRunRequest(includes);
                await this.runner.run(request, cancellationTokenSource.token, debug);
                this.logger.info(`Command complete: ${commandTypeDesc} test class`);
                break;
            case 'run.suite':
            case 'debug.suite':
                // Check that test suites have been detected
                let testSuiteItems = this.itemMap.getTestItemsForSuites();
                if (testSuiteItems.length <= 0) {
                    this.logger.warn(`No test suite definitions have been found. Aborting test run.`, true);
                    return;
                }

                // Get a list of available test suites
                let options: vscode.QuickPickItem[] = [];
                for (let item of testSuiteItems) {
                    let definition = this.itemMap.getTestDefinition(item.id);
                    if (definition) {
                        options.push(new TestItemQuickPickItem(item.id, definition.getTestSuiteName()!, item.uri!.fsPath));
                    }
                }

                // Build quick pick to display known TestSuites
                vscode.window.showQuickPick(options, {
                    canPickMany: false,
                    title: `Choose a test suite to ${commandTypeDesc.toLowerCase()}`
                }).then(async selectedTestSuite => {
                    this.logger.info(`Running command: ${commandTypeDesc} test suite...`);

                    // Validate selected test suite
                    if (!selectedTestSuite) {
                        this.logger.warn('No test suite selected', true);
                        return;
                    }
                    if (!(selectedTestSuite instanceof TestItemQuickPickItem)) {
                        this.logger.warn('Unable to determine test suite ID', true);
                        return;
                    }
                    let testItem = this.itemMap.getTestItem(selectedTestSuite.getId());
                    if (!testItem) {
                        this.logger.warn(`${selectedTestSuite.getId()} is not a recognised test suite.`, true);
                        return;
                    }

                    // Create test run request
                    includes = [ testItem ];
                    request = new vscode.TestRunRequest(includes);
                    await this.runner.run(request, cancellationTokenSource.token, debug);
                    this.logger.info(`Command complete: ${commandTypeDesc} test suite`);
                });

                break;
            case 'run.all':
            case 'debug.all':
                this.logger.info(`Running command: ${commandTypeDesc} all tests...`);

                // Ensure all test files have been parsed before starting the run
                await this.loader.parseWorkspaceTestFiles();

                // Create test run request
                request = new vscode.TestRunRequest();
                await this.runner.run(request, cancellationTokenSource.token, debug);
                this.logger.info(`Command complete: ${commandTypeDesc} all tests`);
                break;
        }
    }
}