import { exec, spawn } from 'child_process';
import * as vscode from 'vscode';
// import { TestRunResult } from './TestRunResult';
// import { TestRunResultStatus } from './TestRunResultItem';
import { TestRunResultParser } from './TestRunResultParser';
import { Logger } from '../output';
import { ItemType } from '../parser/TestItemDefinition';
import { Settings } from '../settings';
import { TestItemMap } from '../parser/TestItemMap';
import { parseTestItemId } from '../parser/TestFileParser';
import { DebugConfigQuickPickItem } from '../ui/DebugConfigQuickPickItem';
import { TestExecutionRequest } from './TestExecutionRequest';

export class TestRunner {
    private ctrl: vscode.TestController;
    private itemMap: TestItemMap;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private settings: Settings;
    private logger: Logger;
    private testItemQueue: Map<string, vscode.TestItem>;
    private testDiagnosticMap: Map<string, vscode.Diagnostic[]>;

    constructor(ctrl: vscode.TestController, itemMap: TestItemMap, diagnosticCollection: vscode.DiagnosticCollection, settings: Settings, logger: Logger) {
        this.ctrl = ctrl;
        this.itemMap = itemMap;
        this.diagnosticCollection = diagnosticCollection;
        this.settings = settings;
        this.logger = logger;
        this.testItemQueue = new Map<string, vscode.TestItem>();
        this.testDiagnosticMap = new Map<string, vscode.Diagnostic[]>();
    }

    public async run(request: vscode.TestRunRequest, cancel: vscode.CancellationToken, debug: boolean = false) {
        // Initialise the test run
        const run = this.ctrl.createTestRun(request);
        const executionRequests: TestExecutionRequest[] = [];
        this.testItemQueue.clear();
        this.testDiagnosticMap.clear();
        this.diagnosticCollection.clear();

        // Start test run logging
        this.logger.setTestRun(run);
        if (this.settings.get('log.autoDisplayOutput') === 'testRunAll') {
            this.logger.showOutputChannel();
        }

        // Build the TestItem queue for this test run
        if (request.include) {
            // Test run is only for a subset of test items
            let parentTestItem: vscode.TestItem = request.include[0];
            this.testItemQueue = this.buildTestRunQueue(run, this.testItemQueue, parentTestItem);

            // Get the workspace folder and settings for the parent test
            let parentTestItemDef = this.itemMap.getTestItemDef(parentTestItem)!;
            let workspaceFolder = vscode.workspace.getWorkspaceFolder(parentTestItemDef!.getWorkspaceFolderUri());
            if (!workspaceFolder) {
                this.logger.warn(`Unable to locate workspace folder for ${parentTestItemDef.getWorkspaceFolderUri()}`);
                return;
            }
            let testExecutionRequest = new TestExecutionRequest(this.settings, workspaceFolder, this.logger);

            // Parse details encoded in test item ID
            let testItemParts = parseTestItemId(parentTestItem.id);
    
            // Determine whether we are running for a folder, class or method within a class
            if (parentTestItemDef.getType() === ItemType.namespace) {
                testExecutionRequest.setTargetClassOrFolder(parentTestItem.uri!);
            } else if (parentTestItemDef.getType() === ItemType.class) {
                testExecutionRequest.setTargetClassOrFolder(parentTestItem.uri!);
            } else if (parentTestItemDef.getType() === ItemType.method) {
                testExecutionRequest.setArgPhpUnit('--filter', '\'' + parentTestItemDef.getPhpUnitId().replace(/\\/g, "\\\\") + '\'');
                if (parentTestItemDef.getTestSuite().length > 0) {
                    testExecutionRequest.setArgPhpUnit('--testsuite', `"${parentTestItemDef.getTestSuite()}"`);
                }
            } else if (parentTestItemDef.getType() === ItemType.testsuite) {
                if (testItemParts && testItemParts.name) {
                    testExecutionRequest.setArgPhpUnit('--testsuite', `"${parentTestItemDef.getTestSuite()}"`);
                }
            }

            // Add to the list of test executions to be run
            executionRequests.push(testExecutionRequest);
        } else {
            // Test run is for all test items (potentially across multiple workspace folders)
            let executionRequired: boolean = false;
            let currentWorkspaceFolder: vscode.WorkspaceFolder | undefined;
            for (let [key, item] of this.ctrl.items) {
                let itemDef = this.itemMap.getTestItemDef(item);
                let workspaceFolder = vscode.workspace.getWorkspaceFolder(itemDef!.getWorkspaceFolderUri());
                if (currentWorkspaceFolder && workspaceFolder !== currentWorkspaceFolder) {
                    // Execute any tests from the current workspace
                    executionRequests.push(new TestExecutionRequest(this.settings, currentWorkspaceFolder, this.logger));
                    executionRequired = false;
                } else {
                    // Set this as the current workspace folder and start building up the test run queue
                    currentWorkspaceFolder = workspaceFolder;
                    this.buildTestRunQueue(run, this.testItemQueue, item);
                    executionRequired = true;
                }
            };
    
            // Clean up final run if required
            if (executionRequired === true && currentWorkspaceFolder) {
                executionRequests.push(new TestExecutionRequest(this.settings, currentWorkspaceFolder, this.logger));
            }
        }

        // Dispatch each of the test execution requests in sequence
        for (let executionRequest of executionRequests) {
            if (cancel.isCancellationRequested !== true) {
                await this.dispatchExecutionRequest(run, executionRequest, cancel, debug);
            }
        }

        // Close out the test run
        this.logger.setTestRun(undefined);
        run.end();
    }

    private async dispatchExecutionRequest(run: vscode.TestRun, request: TestExecutionRequest, cancel: vscode.CancellationToken, debug: boolean = false) {
        let workspaceFolder = request.getWorkspaceFolder();
        
        // If test run is being debugged, prompt user to select debug configuration
        if (debug) {
            // Get launch configurations for workspace
            let launch = vscode.workspace.getConfiguration('launch', workspaceFolder);
            let launchConfigs: any = launch.get('configurations');

            let launchOptions: vscode.QuickPickItem[] = [];
            for (let launchConfig of launchConfigs) {
                if (launchConfig.type === 'php') {
                    launchOptions.push(new DebugConfigQuickPickItem(
                        launchConfig.name,
                        launchConfig.port ?? this.settings.get('xdebug.clientPort', 9003),
                        launchConfig.hostname ?? this.settings.get('xdebug.clientHost', 'localhost')
                    ));
                }
            }

            let selectedQuickPickItem;
            if (launchOptions.length === 1) {
                selectedQuickPickItem = launchOptions[0];
            } else if (launchOptions.length > 1) {
                // Display quick pick to display available debug configurations
                selectedQuickPickItem = await vscode.window.showQuickPick(launchOptions, {
                    canPickMany: false,
                    title: `Select debug config for workspace folder '${workspaceFolder.name}'`
                });
            }

            if (selectedQuickPickItem && (selectedQuickPickItem instanceof DebugConfigQuickPickItem)) {
                // Add Xdebug parameters to PHP command line arguments
                request.setArgPhp('-dxdebug.mode', 'debug');
                request.setArgPhp('-dxdebug.start_with_request', 'yes');
                request.setArgPhp('-dxdebug.client_port', String(selectedQuickPickItem.getClientPort()));
                request.setArgPhp('-dxdebug.client_host', selectedQuickPickItem.getClientHost());

                // Start debug session
                await vscode.debug.startDebugging(workspaceFolder, selectedQuickPickItem.label);
            } else {
                this.logger.warn('Unable to locate a valid debug configuration for this workspace. Test run will be executed without debugging enabled.');
            }
        }

        // Set the command string to the PHP binary
        let commandString = await request.getCommandString();
        let commandArguments = await request.getCommandArguments();

        // Set up handler for test run cancellation signal
        let abortController = new AbortController();
        cancel.onCancellationRequested(e => abortController.abort());

        // Set up parser to capture test results and update TestItems
        let parser = new TestRunResultParser(run, this.testItemQueue, this.logger);

        // Attempt to run command
        // For a good explanation of why we can set event listners after spawning the 
        // child process, see https://stackoverflow.com/questions/59798310/when-does-node-spawned-child-process-actually-start
        this.logger.trace('Executing child process:' + commandString + ' ' + commandArguments.join(' '));
        var child = spawn(commandString, commandArguments, {signal: abortController.signal});
        
        // Handle data written to stdout
        child.stdout.setEncoding('utf-8');
        child.stdout.on('data', (data) => {
            this.logger.trace(data);
            parser.parse(data);
        });

        // Handle data written to stderr
        child.stderr.setEncoding('utf-8');
        child.stderr.on('data', (data) => {
            this.logger.error('stderr: ' + data);
        });

        // Clean up when child process has completed execution
        return new Promise(resolve => {
            child.on('close', (code) => {
                this.logger.trace('Child process completed with exit code: ' + code);
    
                // Print execution summary to logs
                let results = parser.getResults();
                this.logger.info('');
                this.logger.info('-'.repeat(results.getTestRunSummary().length));
                this.logger.info(results.getTestRunSummary());
                this.logger.info('-'.repeat(results.getTestRunSummary().length));
                this.logger.info('');
    
                // If test execution was running in debug mode, stop debugging on completion 
                if (debug) {
                    vscode.debug.stopDebugging();
                }

                resolve(results);
            });
        });
    }

    private buildTestRunQueue(run: vscode.TestRun, queue: Map<string, vscode.TestItem>, item: vscode.TestItem): Map<string, vscode.TestItem> {
        // Mark the test as running
        run.enqueued(item);
        
        // Add to the queue for later lookup by ID
        queue.set(item.id, item);
        item.children.forEach(child => this.buildTestRunQueue(run, queue, child));
        return queue;
    }
}