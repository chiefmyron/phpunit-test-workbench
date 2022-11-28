import { exec } from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import { TestRunResult } from './TestRunResult';
import { TestRunResultItem, TestRunResultStatus } from './TestRunResultItem';
import { TestRunResultParser } from './TestRunResultParser';
import { Logger } from '../output';
import { ItemType } from '../parser/TestItemDefinition';
import { Settings } from '../settings';
import { TestItemMap } from '../parser/TestItemMap';
import { parseTestItemId } from '../parser/TestFileParser';
import { DebugConfigQuickPickItem } from '../ui/DebugConfigQuickPickItem';

// Create promisified version of child process execution
const cp_exec = util.promisify(exec);

export class TestRunner {
    private ctrl: vscode.TestController;
    private itemMap: TestItemMap;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private settings: Settings;
    private logger: Logger;
    private phpBinaryPath: string = '';
    private phpUnitBinaryPath: string = '';
    private phpUnitConfigPath: string = '';

    constructor(ctrl: vscode.TestController, itemMap: TestItemMap, diagnosticCollection: vscode.DiagnosticCollection, settings: Settings, logger: Logger) {
        this.ctrl = ctrl;
        this.itemMap = itemMap;
        this.diagnosticCollection = diagnosticCollection;
        this.settings = settings;
        this.logger = logger;
    }

    public async run(request: vscode.TestRunRequest, token: vscode.CancellationToken, debug: boolean = false) {
        const run = this.ctrl.createTestRun(request);
        const queue = new Map<string, vscode.TestItem>();

        // Start test run
        this.logger.setTestRun(run);
        if (this.settings.get('log.autoDisplayOutput') === 'testRunAll') {
            this.logger.showOutputChannel();
        }
        this.logger.trace('Clearing diagnostic collection of any existing items');
        this.diagnosticCollection.clear();
        let diagnosticMap: Map<string, vscode.Diagnostic[]> = new Map();

        // Get details of the first TestItem in the request (this should be the parent)
        let parentTestItem: vscode.TestItem;
        let testRunResults: TestRunResult = new TestRunResult();
        if (request.include) {
            // Run specific subset of tests
            parentTestItem = request.include[0]!;
            this.buildTestRunQueue(run, queue, parentTestItem);
    
            // Get the workspace folder and settings for the parent test
            let parentTestItemDef = this.itemMap.getTestItemDef(parentTestItem)!;
            let workspaceFolder = vscode.workspace.getWorkspaceFolder(parentTestItemDef!.getWorkspaceFolderUri());
            if (!workspaceFolder) {
                this.logger.warn(`Unable to locate workspace folder for ${parentTestItemDef.getWorkspaceFolderUri()}`);
                return;
            }

            // Parse details encoded in test item ID
            let testItemParts = parseTestItemId(parentTestItem.id);
    
            // Determine whether we are running for a folder, class or method within a class
            let args = new Map<string, string>();
            let target;
            if (parentTestItemDef.getType() === ItemType.namespace) {
                target = parentTestItem.uri!.fsPath;
            } else if (parentTestItemDef.getType() === ItemType.class) {
                target = parentTestItem.uri!.fsPath;
            } else if (parentTestItemDef.getType() === ItemType.method) {
                args.set('--filter', '\'' + parentTestItemDef.getPhpUnitId().replace(/\\/g, "\\\\") + '\'');
                if (parentTestItemDef.getTestSuite().length > 0) {
                    args.set('--testsuite', `"${parentTestItemDef.getTestSuite()}"`);
                }
            } else if (parentTestItemDef.getType() === ItemType.testsuite) {
                if (testItemParts && testItemParts.name) {
                    args.set('--testsuite', `"${testItemParts.name}"`);
                }
            }
    
            testRunResults = await this.runCommand(token, workspaceFolder, debug, target, {phpunit: args});
        } else {
            // Run all top-level test items, and their children
            let runRequired: boolean = false;
            let currentWorkspaceFolder: vscode.WorkspaceFolder | undefined;
            for (let [key, item] of this.ctrl.items) {
                let itemDef = this.itemMap.getTestItemDef(item);
                let workspaceFolder = vscode.workspace.getWorkspaceFolder(itemDef!.getWorkspaceFolderUri());
                if (currentWorkspaceFolder && workspaceFolder !== currentWorkspaceFolder) {
                    // Execute any tests from the current workspace
                    let results = await this.runCommand(token, currentWorkspaceFolder, debug);
                    testRunResults.append(results);
                    runRequired = false;
                } else {
                    // Set this as the current workspace folder and start building up the test run queue
                    currentWorkspaceFolder = workspaceFolder;
                    this.buildTestRunQueue(run, queue, item);
                    runRequired = true;
                }
            };
    
            // Clean up final run if required
            if (runRequired === true && currentWorkspaceFolder) {
                let results = await this.runCommand(token, currentWorkspaceFolder, debug );
                testRunResults.append(results);
            }
        }
    
        // Loop through test run results and set status and message for related TestItems
        this.logger.info('');
        for (const result of testRunResults.getTestRunResultItems()) {
            let item = queue.get(result.getTestItemId());
            if (!item) {
                continue;
            }

            // Get test item definition to generate correct display ID for output
            let displayId = item.id;
            let itemDef = this.itemMap.getTestItemDef(item);
            if (itemDef) {
                displayId = itemDef.getPhpUnitId();
            }
    
            // Set status, duration and messages
            let message;
            let resultMessage = result.getMessage();
            let resultMessageDetail = result.getMessageDetail();
            switch (result.getStatus()) {
                case TestRunResultStatus.passed:
                    this.logger.info(`✅ PASSED: ${displayId}`);
                    run.passed(item, result.getDuration());
                    break;
                case TestRunResultStatus.failed:
                    // Trigger display of Output window, if settings allow
                    if (this.settings.get('log.autoDisplayOutput') === 'testRunFailures') {
                        this.logger.showOutputChannel();
                    }

                    // Format failure message
                    this.logger.error(`❌ FAILED: ${displayId}`);
                    this.logger.error(` - Failure reason: ${resultMessage}`);
                    if (result.getMessageDetail().length > 0) {
                        this.logger.error(` - Failure detail: ${resultMessageDetail}`);
                    }
                    message = new vscode.MarkdownString('**' + resultMessage + '**');
                    run.failed(item, new vscode.TestMessage(message), result.getDuration());

                    // Add diagnostic to display error on correct line in editor
                    if (result.getMessageLineItem() > 0) {
                        let testDocumentUri = item.uri!;
                        let testMessageLineItemIdx = result.getMessageLineItem() - 1;
                        let diagnostics = diagnosticMap.get(testDocumentUri.toString());
                        if (!diagnostics) {
                            diagnostics = [];
                        }

                        let testDocument = await vscode.workspace.openTextDocument(testDocumentUri);
                        let testDocumentLine = testDocument.lineAt(testMessageLineItemIdx);

                        let diagnosticRange = new vscode.Range(
                            new vscode.Position(testMessageLineItemIdx, testDocumentLine.firstNonWhitespaceCharacterIndex),
                            new vscode.Position(testMessageLineItemIdx, testDocumentLine.text.length)
                        );
                        let diagnostic = new vscode.Diagnostic(diagnosticRange, resultMessage, vscode.DiagnosticSeverity.Error);
                        diagnostic.source = 'PHPUnit Test Workbench';
                        diagnostics.push(diagnostic);
                        diagnosticMap.set(testDocumentUri.toString(), diagnostics);
                    }
                    break;
                case TestRunResultStatus.ignored:
                    // Format ignore message
                    message = new vscode.MarkdownString('**' + resultMessage + '**');
                    if (result.getMessageDetail().length > 0) {
                        message.appendMarkdown('\n' + resultMessageDetail);
                    }
                    this.logger.info('➖ IGNORED: ' + displayId, {testItem: item});
                    run.skipped(item);
                    break;
            }
        }

        // Apply diagnostics collected during parsing test run results
        diagnosticMap.forEach((diagnostics, file) => {
            this.diagnosticCollection.set(vscode.Uri.parse(file), diagnostics);
        });
    
        // Mark the test run as complete
        this.logger.info('');
        this.logger.info('-'.repeat(testRunResults.getTestRunSummary().length));
        this.logger.info(testRunResults.getTestRunSummary());
        this.logger.info('-'.repeat(testRunResults.getTestRunSummary().length));
        this.logger.info('');
        this.logger.setTestRun(undefined);
        run.end();
    }
    
    public async runCommand(token: vscode.CancellationToken, workspaceFolder: vscode.WorkspaceFolder, debug: boolean, target?: string, args?: {env?: Map<string, string>, php?: Map<string, string>, phpunit?: Map<string, string>}): Promise<TestRunResult> {
        // Set binary and config file locations
        await this.initPhpBinaryPath(this.settings.get('php.binaryPath', undefined, workspaceFolder));
        await this.initPhpUnitBinaryPath(workspaceFolder, this.settings.get('phpunit.binaryPath', undefined, workspaceFolder));
        await this.initPhpUnitConfigPath(workspaceFolder, this.settings.get('phpunit.locatorPatternConfigXml', undefined, workspaceFolder));

        // Initialise arguments
        let argsEnv = args?.env ?? new Map<string, string>();
        let argsPhp = args?.php ?? new Map<string, string>();
        let argsPhpunit = args?.phpunit ?? new Map<string, string>();

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
                argsPhp.set('-dxdebug.mode', 'debug');
                argsPhp.set('-dxdebug.start_with_request', 'yes');
                argsPhp.set('-dxdebug.client_port', String(selectedQuickPickItem.getClientPort()));
                argsPhp.set('-dxdebug.client_host', selectedQuickPickItem.getClientHost());

                // Start debug session
                await vscode.debug.startDebugging(workspaceFolder, selectedQuickPickItem.label);
            } else {
                this.logger.warn('Unable to locate a valid debug configuration for this workspace. Test run will be executed without debugging enabled.');
            }
        }

        // Start building command string
        let commandParts: string[] = [];

        // Construct the basic command string for executing PHP
        this.logger.info(`Using PHP binary path: ${this.phpBinaryPath}`);
        commandParts.push(this.phpBinaryPath);

        // Add in PHP command-line arguments to command string
        for (const [key, value] of argsPhp) {
            if (value && value.length > 0) {
                commandParts.push(key + '=' + value);
            } else {
                commandParts.push(key);
            }
        }

        // Add in PHPUnit binary to the command string
        this.logger.info(`Using PHPUnit binary path: ${this.phpUnitBinaryPath}`);
        commandParts.push(this.phpUnitBinaryPath);

        // Add in PHPUnit command-line arguments to command string
        argsPhpunit.set('--teamcity', '');
        if (this.phpUnitConfigPath.length > 0) {
            this.logger.info(`Using PHPUnit configuration file: ${this.phpUnitConfigPath}`);
            argsPhpunit.set('-c', this.phpUnitConfigPath);
        }
        for (const [key, value] of argsPhpunit) {
            commandParts.push(key);
            if (value && value.length > 0) {
                commandParts.push(value);
            }
        }

        // Determine the target folder or file to use for test execution context
        let targetPath = target;
        if (!targetPath) {
            targetPath = await this.guessPhpUnitTargetPath(workspaceFolder);
        }

        // Finish with target folder or file for all runs (other than test suites)
        if (argsPhpunit.has('--testsuite') === false) {
            commandParts.push(targetPath);
        }
        this.logger.info(`Using PHPUnit target directory: ${targetPath}`);

        // Build command string from parts
        const command = commandParts.join(' ');
        this.logger.trace('Executing command to start test run: ' + command);

        // Set up handler for cancellation
        let abortController = new AbortController();
        token.onCancellationRequested(e => abortController.abort());

        // Attempt to run command
        let results: TestRunResult = new TestRunResult();
        const parser = new TestRunResultParser(this.logger);
        try {
            const { stdout, stderr } = await cp_exec(command, { signal: abortController.signal });
            if (stderr) {
                this.logger.error(stderr);
            }
            if (stdout) {
                this.logger.trace(stdout);
                results = parser.parse(stdout);
            }
        } catch (e: any) {
            // Failed tests will result in the command returning an error code, but the
            // output is the same as a successful run and can still be parsed in the same way
            if (e.stdout) {
                this.logger.trace(e.stdout);
                results = parser.parse(e.stdout.toString());
            } else {
                this.logger.error(e);
            }
        }

        if (debug) {
            vscode.debug.stopDebugging();
        }
        return results;
    }

    private buildTestRunQueue(run: vscode.TestRun, queue: Map<string, vscode.TestItem>, item: vscode.TestItem) {
        // Mark the test as running
        run.started(item);
        
        // Add to the queue for later lookup by ID
        queue.set(item.id, item);
        item.children.forEach(child => this.buildTestRunQueue(run, queue, child));
        return queue;
    }

    private async initPhpBinaryPath(settingValue?: string) {
        // If a setting has been provided, it has first priority
        if (settingValue) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.parse(settingValue));
                this.phpBinaryPath = settingValue;
            } catch {
                this.logger.warn(`Could not find PHP binary specified in settings: ${settingValue}`);
            }
        }

        if (this.phpBinaryPath.trim().length <= 0) {
            // Setting was either not provided or not successful - assume binary is available via $PATH
            this.phpBinaryPath = 'php';
        }
    }

    private async initPhpUnitBinaryPath(workspaceFolder: vscode.WorkspaceFolder, settingValue?: string) {
        let phpUnitBinaryPathOptions: vscode.Uri[] = [];

        // If a setting has been provided, it has first priority
        if (settingValue) {
            phpUnitBinaryPathOptions.push(vscode.Uri.parse(settingValue));
            phpUnitBinaryPathOptions.push(vscode.Uri.parse(workspaceFolder.uri.path + '/' + settingValue));
        }
        
        // Define fallback options
        phpUnitBinaryPathOptions.push(vscode.Uri.parse(workspaceFolder.uri.path + '/vendor/phpunit/phpunit/phpunit'));
        phpUnitBinaryPathOptions.push(vscode.Uri.parse(workspaceFolder.uri.path + '/phpunit.phar'));

        // Loop through the options and use the first one where the file actually exists
        for (let pathOption of phpUnitBinaryPathOptions) {
            try {
                await vscode.workspace.fs.stat(pathOption);
                this.phpUnitBinaryPath = pathOption.fsPath;
                break;
            } catch {
                this.logger.warn(`Could not find PHPUnit binary specified in settings or in common fallback location: ${pathOption.fsPath}`);
            }
        }

        if (this.phpUnitBinaryPath.trim().length <= 0) {
            // No fallback options were successful - assume binary is available via $PATH
            if (process.platform === 'win32') {
                this.phpUnitBinaryPath = 'phpunit.bat';
            } else {
                this.phpUnitBinaryPath = 'phpunit';
            }
        }
    }

    private async initPhpUnitConfigPath(workspaceFolder: vscode.WorkspaceFolder, settingValue?: string) {
        // If a setting has been provided, it has first priority
        let phpUnitConfigPatternStr = '{test,tests,Test,Tests}/phpunit.xml';
        if (settingValue) {
            phpUnitConfigPatternStr = settingValue;
        }

		let phpUnitConfigPattern = new vscode.RelativePattern(workspaceFolder, phpUnitConfigPatternStr);
		await vscode.workspace.findFiles(phpUnitConfigPattern).then((files: vscode.Uri[]) => {
			files.forEach((file: vscode.Uri) => {
				this.phpUnitConfigPath = file.fsPath;
                return;
			});
		});
        this.logger.warn(`No configuration file detected!`);
    }

    private async guessPhpUnitTargetPath(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
        // If a setting has been provided, it has first priority
        let settingValue = this.settings.get('phpunit.testDirectory', undefined, workspaceFolder);
        if (settingValue) {
            try {
                let targetPathUri = workspaceFolder.uri.with({ path: workspaceFolder.uri.path + '/' + settingValue });
                await vscode.workspace.fs.stat(targetPathUri);
                return targetPathUri.fsPath;
            } catch {
                this.logger.warn(`Could not find PHPUnit target directory specified in settings: ${settingValue}`);
            }
        }

        // Fall back to use workspace folder as the default location
        return workspaceFolder.uri.fsPath;
    }
}