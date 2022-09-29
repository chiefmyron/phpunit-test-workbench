import { exec, ExecException } from 'child_process';
import * as vscode from 'vscode';
import { TestRunResultItem } from './TestRunResultItem';
import { TestRunResultParser } from './TestRunResultParser';
import * as util from 'util';
import { Logger } from '../output';

// Create promisified version of child process execution
const cp_exec = util.promisify(exec);

export class TestRunner {
    private logger: Logger;
    private phpBinaryPath: string = '';
    private phpUnitBinaryPath: string = '';
    private phpUnitConfigPath: string = '';
    private phpUnitTargetPath: string = '';

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public setPhpUnitTargetPath(target: string) {
        this.phpUnitTargetPath = target;
    }
    
    public async runCommand(workspaceFolder: vscode.WorkspaceFolder, args: Map<string, string>): Promise<TestRunResultItem[]> {
        // Use provided settings for runner, if provided
        const settings = vscode.workspace.getConfiguration('phpunit-test-workbench', workspaceFolder);
        
        // Set binary and config file locations
        await this.initPhpBinaryPath(settings.get('php.binaryPath'));
        await this.initPhpUnitBinaryPath(workspaceFolder, settings.get('phpunit.binaryPath'));
        await this.initPhpUnitConfigPath(workspaceFolder, settings.get('phpunit.locatorPatternPhpUnitXml'));
        await this.initPhpUnitTargetPath(workspaceFolder, settings.get('phpunit.targetDirectory'));

        // Construct the basic command string for executing PHPUnit
        let command = this.phpBinaryPath + ' ' + this.phpUnitBinaryPath;

        // Add in command-line options
        args.set('--teamcity', '');
        if (this.phpUnitConfigPath.length > 0) {
            args.set('-c', this.phpUnitConfigPath);
        }
        for (const [key, value] of args) {
            command = command + ' ' + key;
            if (value && value.length > 0) {
                command = command + ' ' + value;
            }
        }

        // Finish with target folder or file
        command = command + ' ' + this.phpUnitTargetPath;
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

    private async initPhpBinaryPath(settingValue?: string) {
        // If a setting has been provided, it has first priority
        if (settingValue) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.parse(settingValue));
                this.phpBinaryPath = settingValue;
            } catch {
                this.logger.warn(`    Could not find PHP binary specified in settings: ${settingValue}`);
            }
        }

        if (this.phpBinaryPath.trim().length <= 0) {
            // Setting was either not provided or not successful - assume binary is available via $PATH
            this.phpBinaryPath = 'php';
        }
        this.logger.info(`    Using PHP binary path: ${this.phpBinaryPath}`);
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
                this.logger.warn(`    Could not find PHPUnit binary specified in settings or in common fallback location: ${pathOption.fsPath}`);
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
        this.logger.info(`    Using PHPUnit binary path: ${this.phpUnitBinaryPath}`);
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
                this.logger.info(`    Using PHPUnit configuration file: ${this.phpUnitConfigPath}`);
                return;
			});
		});
        this.logger.warn(`    No configuration file detected!`);
    }

    private async initPhpUnitTargetPath(workspaceFolder: vscode.WorkspaceFolder, settingValue?: string) {
        // Check if target path has already been set
        if (this.phpUnitTargetPath.trim().length > 0) {
            return;
        }

        // If a setting has been provided, it has first priority
        if (settingValue) {
            try {
                let targetPathUri = workspaceFolder.uri.with({ path: workspaceFolder.uri.path + '/' + settingValue });
                await vscode.workspace.fs.stat(targetPathUri).then(stat => {
                    this.phpUnitTargetPath = targetPathUri.fsPath;
                    this.logger.info(`    Using PHPUnit target directory: ${this.phpUnitTargetPath}`);
                    return;
                });
            } catch {
                this.logger.warn(`    Could not find PHPUnit target directory specified in settings: ${settingValue}`);
            }
        }

        // Fall back to use workspace folder as the default location
        if (this.phpUnitTargetPath.trim().length <= 0) {
            this.phpUnitTargetPath = workspaceFolder.uri.fsPath;
        }
    }
}