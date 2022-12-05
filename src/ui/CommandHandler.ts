import * as vscode from 'vscode';
import { Settings } from "../settings";
import { Logger } from "../output";
import { TestFileParser } from '../parser/TestFileParser';
import { TestItemMap } from '../parser/TestItemMap';
import { TestRunner } from "../runner/TestRunner";
import { TestItemQuickPickItem } from './TestItemQuickPickItem';

export class CommandHandler {
    private ctrl: vscode.TestController;
    private parser: TestFileParser;
    private itemMap: TestItemMap;
    private runner: TestRunner;
    private settings: Settings;
    private logger: Logger;

    constructor(
        ctrl: vscode.TestController,
        parser: TestFileParser,
        itemMap: TestItemMap,
        runner: TestRunner,
        settings: Settings,
        logger: Logger
    ) {
        this.ctrl = ctrl;
        this.parser = parser;
        this.itemMap = itemMap;
        this.runner = runner;
        this.settings = settings;
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

                // Find test item definition for the document
                let classTestItem = this.itemMap.getTestItemForClass(editor.document.uri);
                if (!classTestItem) {
                    this.logger.warn(`No test item definition was found for the current class. Aborting test run.`, true);
                    return;
                }

                // Find the closest method name above the location of the cursor
                for (let [id, methodTestItem] of classTestItem.children) {
                    if (methodTestItem.range && methodTestItem.range.contains(editor.selection.active)) {
                        testItem = methodTestItem;
                    }
                }
                if (!testItem) {
                    this.logger.warn(`No test item definition was found at the current cursor location. Aborting test run.`, true);
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

                // Find test item definition for the document
                testItem = this.itemMap.getTestItemForClass(editor.document.uri);
                if (!testItem) {
                    this.logger.warn(`No test item definition was found for the current class. Aborting test run.`, true);
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
                if (this.itemMap.getTestSuites().length <= 0) {
                    this.logger.warn(`No test suite definitions have been found. Aborting test run.`, true);
                    return;
                }

                // Get a list of available test suites
                let options: vscode.QuickPickItem[] = [];
                for (let testItem of this.itemMap.getTestSuites()) {
                    let testItemDef = this.itemMap.getTestItemDef(testItem)!;
                    options.push(new TestItemQuickPickItem(testItem.id, testItemDef.getTestSuite(), testItem.uri!.fsPath));
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
                await this.parser.refreshTestFilesInWorkspace();

                // Create test run request
                request = new vscode.TestRunRequest();
                await this.runner.run(request, cancellationTokenSource.token, debug);
                this.logger.info(`Command complete: ${commandTypeDesc} all tests`);
                break;
        }
    }
}