import { exec } from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import { TestRunResultItem, TestRunResultStatus } from './TestRunResultItem';
import { TestRunResultParser } from './TestRunResultParser';
import { Logger } from '../output';
import { ItemType } from '../parser/TestItemDefinition';
import { Settings } from '../settings';
import { TestItemMap } from '../parser/TestItemMap';
import { parseTestItemId } from '../parser/TestFileParser';

// Create promisified version of child process execution
const cp_exec = util.promisify(exec);

export class TestRunner {
    private ctrl: vscode.TestController;
    private itemMap: TestItemMap;
    private settings: Settings;
    private logger: Logger;
    private phpBinaryPath: string = '';
    private phpUnitBinaryPath: string = '';
    private phpUnitConfigPath: string = '';

    constructor(ctrl: vscode.TestController, itemMap: TestItemMap, settings: Settings, logger: Logger) {
        this.ctrl = ctrl;
        this.itemMap = itemMap;
        this.settings = settings;
        this.logger = logger;
    }

    public async run(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
        const run = this.ctrl.createTestRun(request);
        const queue = new Map<string, vscode.TestItem>();
    
        // Get details of the first TestItem in the request (this should be the parent)
        this.logger.showOutputChannel();
        this.logger.info('Starting new test run...');
        let parentTestItem: vscode.TestItem;
        let testRunResults: TestRunResultItem[] = [];
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
            } else if (parentTestItemDef.getType() === ItemType.testsuite) {
                if (testItemParts && testItemParts.name) {
                    args.set('--testsuite', testItemParts.name);
                }
            }
    
            testRunResults = await this.runCommand(workspaceFolder, args, target);
        } else {
            // Run all top-level test items, and their children
            let runRequired: boolean = false;
            let currentWorkspaceFolder: vscode.WorkspaceFolder | undefined;
            for (let [key, item] of this.ctrl.items) {
                let itemDef = this.itemMap.getTestItemDef(item);
                let workspaceFolder = vscode.workspace.getWorkspaceFolder(itemDef!.getWorkspaceFolderUri());
                if (currentWorkspaceFolder && workspaceFolder !== currentWorkspaceFolder) {
                    // Execute any tests from the current workspace
                    let results = await this.runCommand(currentWorkspaceFolder, new Map<string, string>());
                    testRunResults = testRunResults.concat(results);
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
                let results = await this.runCommand(currentWorkspaceFolder, new Map<string, string>());
                testRunResults = testRunResults.concat(results);
            }
        }
    
        // Loop through test run results and set status and message for related TestItems
        for (const result of testRunResults) {
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
            switch (result.getStatus()) {
                case TestRunResultStatus.passed:
                    this.logger.info('✅ PASSED: ' + displayId);
                    run.passed(item, result.getDuration());
                    break;
                case TestRunResultStatus.failed:
                    // Format failure message
                    message = new vscode.MarkdownString('**' + result.getMessage() + '**');
                    this.logger.error('❌ FAILED: ' + displayId);
                    this.logger.error(' - Failure reason: ' + result.getMessage());
                    if (result.getMessageDetail().length > 0) {
                        message.appendMarkdown('\n' + result.getMessageDetail().replace("|n", "\n"));
                        this.logger.error(' - Failure detail: ' + result.getMessageDetail().replace("|n", "\n"));
                    }
                    run.failed(item, new vscode.TestMessage(message), result.getDuration());
                    break;
                case TestRunResultStatus.ignored:
                    // Format ignore message
                    message = new vscode.MarkdownString('**' + result.getMessage() + '**');
                    if (result.getMessageDetail().length > 0) {
                        message.appendMarkdown('\n' + result.getMessageDetail().replace("|n", "\n"));
                    }
                    this.logger.error('➖ IGNORED: ' + displayId);
                    run.skipped(item);
                    break;
            }
        }
    
        // Mark the test run as complete
        this.logger.info('Test run completed!');
        run.end();
    }
    
    public async runCommand(workspaceFolder: vscode.WorkspaceFolder, args: Map<string, string>, target?: string): Promise<TestRunResultItem[]> {
        // Set binary and config file locations
        await this.initPhpBinaryPath(this.settings.get('php.binaryPath', undefined, workspaceFolder));
        await this.initPhpUnitBinaryPath(workspaceFolder, this.settings.get('phpunit.binaryPath', undefined, workspaceFolder));
        await this.initPhpUnitConfigPath(workspaceFolder, this.settings.get('phpunit.locatorPatternConfigXml', undefined, workspaceFolder));

        // Construct the basic command string for executing PHPUnit
        this.logger.info(`Using PHP binary path: ${this.phpBinaryPath}`);
        this.logger.info(`Using PHPUnit binary path: ${this.phpUnitBinaryPath}`);
        let command = this.phpBinaryPath + ' ' + this.phpUnitBinaryPath;

        // Add in command-line options
        args.set('--teamcity', '');
        if (this.phpUnitConfigPath.length > 0) {
            this.logger.info(`Using PHPUnit configuration file: ${this.phpUnitConfigPath}`);
            args.set('-c', this.phpUnitConfigPath);
        }
        for (const [key, value] of args) {
            command = command + ' ' + key;
            if (value && value.length > 0) {
                command = command + ' ' + value;
            }
        }

        // Determine the target folder or file to use for test execution context
        let targetPath = target;
        if (!targetPath) {
            targetPath = await this.guessPhpUnitTargetPath(workspaceFolder);
        }

        // Finish with target folder or file for all runs (other than test suites)
        if (args.has('--testsuite') === false) {
            command = command + ' ' + targetPath;
        }
        this.logger.info(`Using PHPUnit target directory: ${targetPath}`);
        this.logger.trace('Executing command to start test run: ' + command);

        // Attempt to run command
        let results: TestRunResultItem[] = [];
        const parser = new TestRunResultParser(this.logger);
        try {
            const { stdout, stderr } = await cp_exec(command);
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