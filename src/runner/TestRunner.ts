import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { Settings } from '../settings';
import { Logger } from '../output';
import { TestRunResultParser } from './TestRunResultParser';
import { TestExecutionRequest } from './TestExecutionRequest';
import { TestRunResultMap } from './TestRunResultMap';
import { TestItemMap } from '../loader/tests/TestItemMap';
import { DebugConfigQuickPickItem } from '../ui/DebugConfigQuickPickItem';
import { TestResultStatus } from './TestResult';
import { ContinuousTestRunDefinition } from './continuous/ContinuousTestRunDefinition';

export class TestRunner {
    private ctrl: vscode.TestController;
    private itemMap: TestItemMap;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private settings: Settings;
    private logger: Logger;
    private testItemQueue: Map<string, vscode.TestItem>;
    private testDiagnosticMap: Map<string, vscode.Diagnostic[]>;
    private activeContinuousRuns: Map<vscode.RelativePattern, ContinuousTestRunDefinition>;

    constructor(ctrl: vscode.TestController, itemMap: TestItemMap, diagnosticCollection: vscode.DiagnosticCollection, settings: Settings, logger: Logger) {
        this.ctrl = ctrl;
        this.itemMap = itemMap;
        this.diagnosticCollection = diagnosticCollection;
        this.settings = settings;
        this.logger = logger;
        this.testItemQueue = new Map<string, vscode.TestItem>();
        this.testDiagnosticMap = new Map<string, vscode.Diagnostic[]>();
        this.activeContinuousRuns = new Map<vscode.RelativePattern, ContinuousTestRunDefinition>();
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

        // Get tag from run profile (if set)
        let tagId = request.profile?.tag?.id;

        if (request.include && request.include.length > 0) {
            // Test run is only for a subset of test items
            let parentTestItem = request.include[0];
            let parentTestItemDef = this.itemMap.getTestDefinition(parentTestItem.id)!;

            // Enqueue this TestItem and all of its children
            this.testItemQueue = this.buildTestRunQueue(run, this.testItemQueue, parentTestItem, tagId);

            // Create TestExecutionRequest for the TestItem and add to the list of executions to be run
            let testExecutionRequest = TestExecutionRequest.createForTestItem(parentTestItem, parentTestItemDef, this.settings, this.logger, tagId);
            if (testExecutionRequest) {
                executionRequests.push(testExecutionRequest);
            }
        } else {
            // Test run is for all test items (potentially across multiple workspaces)
            let workspaceFolders: vscode.WorkspaceFolder[] = [];
            for (let [key, parentTestItem] of this.ctrl.items) {
                // Enqueue this TestItem and all of its children
                this.testItemQueue = this.buildTestRunQueue(run, this.testItemQueue, parentTestItem, tagId);

                // Check if this workspace folder has already been encountered during the run
                let workspaceFolder = vscode.workspace.getWorkspaceFolder(parentTestItem.uri!);
                if (workspaceFolder && workspaceFolders.indexOf(workspaceFolder) <= -1) {
                    workspaceFolders.push(workspaceFolder);
                }
            }

            // Create a TestExecutionRequest for each unique workspace folder and add to the list of executions to be run
            for (let workspaceFolder of workspaceFolders) {
                let testExecutionRequest = TestExecutionRequest.createForWorkspaceFolder(workspaceFolder, this.settings, this.logger, tagId);
                if (testExecutionRequest) {
                    executionRequests.push(testExecutionRequest);
                }
            }
        }

        // Dispatch each of the test execution requests in sequence
        for (let executionRequest of executionRequests) {
            if (cancel.isCancellationRequested !== true) {
                let resultMap: TestRunResultMap = await this.dispatchExecutionRequest(run, executionRequest, cancel, debug);

                // Print execution summary to logs
                this.logTestRunSummary(resultMap);

                // Add diagnostics to source code
                this.logFailuresAsDiagnostics(resultMap, executionRequest.getWorkspaceFolder());
            }
        }

        // Close out the test run
        this.logger.setTestRun(undefined);
        run.end();
    }

    private async dispatchExecutionRequest(run: vscode.TestRun, request: TestExecutionRequest, cancel: vscode.CancellationToken, debug: boolean = false): Promise<TestRunResultMap> {
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
        let parser = new TestRunResultParser(run, this.testItemQueue, this.settings, this.logger);

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
            this.logger.error(``);
            this.logger.error(`---- fatal error ----`);
            this.logger.error(data);
            this.logger.error(`---------------------`);
            if (this.settings.get('log.autoDisplayOutput', 'errorsOnly') !== 'never') {
                this.logger.showOutputChannel();
            }
        });

        // Clean up when parser has finished processing 
        return new Promise(resolve => {
            child.on('close', (code) => {
                this.logger.trace('Child process completed with exit code: ' + code);
    
                // If test execution was running in debug mode, stop debugging on completion 
                if (debug) {
                    vscode.debug.stopDebugging();
                }
    
                if (parser.isParsing() === false) {
                    resolve(parser.getResultMap());
                }
            });

            child.on('exit', (code) => {
                this.logger.trace('Child process exited with exit code: ' + code);
    
                // If test execution was running in debug mode, stop debugging on completion 
                if (debug) {
                    vscode.debug.stopDebugging();
                }
    
                if (parser.isParsing() === false) {
                    resolve(parser.getResultMap());
                }
            });

            child.on('error', (err) => {
                this.logger.error('Unable to start child process: ' + err);
            });

            parser.onParsingComplete((event) => {
                this.logger.trace('Message parser completed processing queue');

                // Only print out summary and resolve if the child process has also finished running
                // (There may be situations where the parser runs out of messages to parse but the script
                // is still running)
                if (child.exitCode) {
                    resolve(event.resultMap);
                }
            });
        });
    }

    private logTestRunSummary(resultMap: TestRunResultMap) {
        let numTestResults = resultMap.getNumTestResults();
        let numTestItems = resultMap.getNumTestItems();
        let numAssertions = resultMap.getNumAssertions();
        let numSkipped = resultMap.getNumSkipped();
        let numFailed = resultMap.getNumFailed();
        let numErrors = resultMap.getNumErrors();

        // Created formatted output string
        let output = `Test run completed: `;
        if (numTestResults <= 0) {
            output = output + `No test summary information available.`;
        } else if (numTestResults === 1) {
            output = output + `${numTestResults} test`;
        } else {
            output = output + `${numTestResults} tests`;
        }
        if (numTestItems !== numTestResults && numTestItems === 1) {
            output = output + ` (${numTestItems} unique test method)`;
        } else if (numTestItems !== numTestResults && numTestItems > 1) {
            output = output + ` (${numTestItems} unique test methods)`;
        }
        if (numAssertions === 1) {
            output = output + `, ${numAssertions} assertion`;
        } else if (numAssertions > 1) {
            output = output + `, ${numAssertions} assertions`;
        }
        if (numSkipped > 0) {
            output = output + `, ${numSkipped} skipped`;
        }
        if (numFailed > 0) {
            output = output + `, ${numFailed} failed`;
        }
        if (numErrors > 0) {
            output = output + `, ${numErrors} errored`;
        }

        // Print summary to log
        this.logger.info('');
        this.logger.info('-'.repeat(output.length));
        this.logger.info(output);
        this.logger.info('-'.repeat(output.length));
        this.logger.info('');
    }

    private async logFailuresAsDiagnostics(resultMap: TestRunResultMap, workspaceFolder: vscode.WorkspaceFolder) {
        if (this.settings.get('log.displayFailuresAsErrorsInCode', false, workspaceFolder) !== true) {
            return;
        }

        let resultTestItems = resultMap.getTestItems();
        for (let testItem of resultTestItems) {
            // Only display diagnostics for test failures
            let status = resultMap.getTestStatus(testItem);
            if (status !== TestResultStatus.failed) {
                continue;
            }

            // Get the results for the test item
            let results = resultMap.getTestResults(testItem);
            for (let result of results) {
                // Only display diagnostics if the test failure contains a message
                let message = result.getMessage();
                if (!message) {
                    continue;
                }

                // Only display diagnostics if the test failure contains line item range details
                let messageLineNum = result.getMessageLineNum();
                if (!messageLineNum) {
                    continue;
                }

                // Add diagnostic to display error on correct line in editor
                let testDocumentUri = testItem.uri!;
                let testMessageLineItemIdx = messageLineNum - 1;
                let diagnostics = this.testDiagnosticMap.get(testDocumentUri.toString());
                if (!diagnostics) {
                    diagnostics = [];
                }

                let testDocument = await vscode.workspace.openTextDocument(testDocumentUri);
                let testDocumentLine = testDocument.lineAt(testMessageLineItemIdx);

                let diagnosticRange = new vscode.Range(
                    new vscode.Position(testMessageLineItemIdx, testDocumentLine.firstNonWhitespaceCharacterIndex),
                    new vscode.Position(testMessageLineItemIdx, testDocumentLine.text.length)
                );
                let diagnostic = new vscode.Diagnostic(diagnosticRange, message, vscode.DiagnosticSeverity.Error);
                diagnostic.source = 'PHPUnit Test Workbench';
                diagnostics.push(diagnostic);
                this.testDiagnosticMap.set(testDocumentUri.toString(), diagnostics);
            }
        }

        // Apply diagnostics collected during parsing test run results
        this.testDiagnosticMap.forEach((diagnostics, file) => {
            this.diagnosticCollection.set(vscode.Uri.parse(file), diagnostics);
        });
    }

    private buildTestRunQueue(run: vscode.TestRun, queue: Map<string, vscode.TestItem>, item: vscode.TestItem, tagId?: string): Map<string, vscode.TestItem> {
        // Check if this is a test method
        if (item.canResolveChildren === false) {
            if (!tagId) {
                // No tag filter - always enqueue
                run.enqueued(item);
            } else {
                // Check if the TestItem has been tagged with the filter specified
                for (let tag of item.tags) {
                    if (tag.id === tagId) {
                        run.enqueued(item);
                        break;
                    }
                }
            }
        }
        
        // Add to the queue for later lookup by ID
        queue.set(item.id, item);
        item.children.forEach(child => this.buildTestRunQueue(run, queue, child, tagId));
        return queue;
    }

    /*
     * Continuous test run functionality
    */
    public addContinuousTestRunDetails(request: vscode.TestRunRequest, cancel: vscode.CancellationToken, patterns: vscode.RelativePattern[], debug: boolean = false) {
        for (let pattern of patterns) {
            let continuousRunDef = new ContinuousTestRunDefinition(
                request,
                cancel,
                pattern,
                debug
            );
            this.activeContinuousRuns.set(pattern, continuousRunDef);
        }

        // Handle continuous run cancellation by removing patterns from the list of active runs
        cancel.onCancellationRequested(event => {
            for (let pattern of patterns) {
                this.activeContinuousRuns.delete(pattern);
            }
        });
    }

    public checkForActiveContinuousRun(document: vscode.TextDocument) {
        // Get URI for document
        for (let pattern of this.activeContinuousRuns.keys()) {
            if (vscode.languages.match({ pattern: pattern }, document) !== 0) {
                // Get continuous test run definition
                let continuousRun = this.activeContinuousRuns.get(pattern);
                if (!continuousRun) {
                    break;
                }

                // Document falls under scope of an active continuous run - start a new test run now
                this.run(continuousRun.createTestRunRequest(), continuousRun.getCancellationToken(), continuousRun.isDebug());
                return;
            }
        }
    }

    public removeContinuousRunForDeletedFile(deletedFileUri: vscode.Uri) {
        // Try and match the old file to an existing continuous run pattern
        for (let pattern of this.activeContinuousRuns.keys()) {
            let patternUri = pattern.baseUri.with({ path: pattern.baseUri.path + '/' + pattern.pattern });
            if (patternUri.toString() === deletedFileUri.toString()) {
                // Remove pattern from the list of active runs
                this.activeContinuousRuns.delete(pattern);
                return;
            }
        }
    }
}