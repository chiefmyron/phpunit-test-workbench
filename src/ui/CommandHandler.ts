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
    private profileMap: Map<string, vscode.TestRunProfile>;
    private runner: TestRunner;
    private logger: Logger;

    constructor(
        loader: TestFileLoader,
        itemMap: TestItemMap,
        profileMap: Map<string, vscode.TestRunProfile>,
        runner: TestRunner,
        logger: Logger
    ) {
        this.loader = loader;
        this.itemMap = itemMap;
        this.profileMap = profileMap;
        this.runner = runner;
        this.logger = logger;
    }

    public async execute(command: string) {
        const editor = vscode.window.activeTextEditor;
        let testItem: vscode.TestItem | undefined;
        let includes: vscode.TestItem[];
        let request: vscode.TestRunRequest | undefined;
        let cancellationTokenSource = new vscode.CancellationTokenSource();
        let tagId: string | undefined = undefined;

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
                await this.executeTestRunRequest(includes, [], cancellationTokenSource.token, debug);
                this.logger.info(`Command complete: ${commandTypeDesc} test method`);
                break;
            case 'run.class':
            case 'run.class.tag':
            case 'debug.class':
            case 'debug.class.tag':
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

                // If the run is being filtered by a tag, prompt the user to select the tag
                if (command.endsWith('tag') === true) {
                    tagId = await this.getTagIdFromQuickPick();
                }

                // Create test run request
                includes = [ testItem ];
                await this.executeTestRunRequest(includes, [], cancellationTokenSource.token, debug, tagId);
                this.logger.info(`Command complete: ${commandTypeDesc} test class`);
                break;
            case 'run.suite':
            case 'run.suite.tag':
            case 'debug.suite':
            case 'debug.suite.tag':
                this.logger.info(`Running command: ${commandTypeDesc} test suite...`);

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
                let selectedTestSuite = await vscode.window.showQuickPick(options, {
                    canPickMany: false,
                    title: `Choose a test suite to ${commandTypeDesc.toLowerCase()}`
                });

                // Validate selected test suite
                if (!selectedTestSuite) {
                    this.logger.warn('No test suite selected', true);
                    return;
                }
                if (!(selectedTestSuite instanceof TestItemQuickPickItem)) {
                    this.logger.warn('Unable to determine test suite ID', true);
                    return;
                }
                testItem = this.itemMap.getTestItem(selectedTestSuite.getId());
                if (!testItem) {
                    this.logger.warn(`${selectedTestSuite.getId()} is not a recognised test suite.`, true);
                    return;
                }

                // If the run is being filtered by a tag, prompt the user to select the tag
                if (command.endsWith('tag') === true) {
                    tagId = await this.getTagIdFromQuickPick();
                }

                // Create test run request
                includes = [ testItem ];
                await this.executeTestRunRequest(includes, [], cancellationTokenSource.token, debug, tagId);
                this.logger.info(`Command complete: ${commandTypeDesc} test suite`);
                

                break;
            case 'run.all':
            case 'run.all.tag':
            case 'debug.all':
            case 'debug.all.tag':
                this.logger.info(`Running command: ${commandTypeDesc} all tests...`);

                // Ensure all test files have been parsed before starting the run
                await this.loader.parseWorkspaceTestFiles();

                // If the run is being filtered by a tag, prompt the user to select the tag
                if (command.endsWith('tag') === true) {
                    tagId = await this.getTagIdFromQuickPick();
                }

                // Create test run request
                await this.executeTestRunRequest(undefined, [], cancellationTokenSource.token, debug, tagId);
                this.logger.info(`Command complete: ${commandTypeDesc} all tests`);
                break;
        }
    }

    private async getTagIdFromQuickPick(): Promise<string | undefined> {
        return vscode.window.showQuickPick(this.itemMap.getTagIds(), {
            canPickMany: false,
            title: `Choose a tag to filter by`
        });
    }

    private async executeTestRunRequest(
        include: vscode.TestItem[] | undefined,
        exclude: vscode.TestItem[] | undefined,
        cancellationToken: vscode.CancellationToken,
        debug: boolean,
        tagId?: string
    ) {
        // If the run is being filtered by a tag, prompt the user to select the tag
        let profile: vscode.TestRunProfile | undefined = undefined;
        if (tagId) {
            let profileId = tagId + '::RUN';
            if (debug === true) {
                profileId = tagId + '::DEBUG';
            }
            profile = this.profileMap.get(profileId);
            if (!profile) {
                this.logger.warn(`Unable to find a test run profile for '${tagId}'. Aborting test run.`, true);
                return;
            }
        }

        // Create test run request
        let request = new vscode.TestRunRequest(include, exclude, profile);
        return this.runner.run(request, cancellationToken, debug);
    }
}