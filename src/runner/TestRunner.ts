import { exec } from 'child_process';
import * as vscode from 'vscode';

export class TestRunner {
    private phpBinaryPath: string = '';
    private phpUnitBinaryPath: string = '';
    private phpUnitConfigPath: string = '';
    private phpUnitTargetPath: string = '';

    public setPhpUnitTargetPath(target: string) {
        this.phpUnitTargetPath = target;
    }
    
    public async runCommand(workspaceFolder: vscode.WorkspaceFolder, args: Map<string, string> ) {
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
        console.log('[TestRunner] Executing command: ' + command);

        // Attempt to run command
		await exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(`error: ${error.message}`);
			}
	
			if (stderr) {
				console.error(`stderr: ${stderr}`);
			}
	
			console.log(`stdout:\n${stdout}`);
		});
    }

    private async initPhpBinaryPath(settingValue?: string) {
        // If a setting has been provided, it has first priority
        if (settingValue) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.parse(settingValue));
                this.phpBinaryPath = settingValue;
            } catch {
                console.warn(`[TestRunner] Could not find PHP binary at location: ${settingValue}`);
            }
        }

        if (this.phpBinaryPath.trim().length <= 0) {
            // Setting was either not provided or not successful - assume binary is available via $PATH
            this.phpBinaryPath = 'php';
        }
        console.info(`[TestRunner] Using PHP binary path: ${this.phpBinaryPath}`);
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
                console.warn(`[TestRunner] Could not find PHPUnit binary at location: ${pathOption.fsPath}`);
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
        console.info(`[TestRunner] Using PHPUnit binary path: ${this.phpUnitBinaryPath}`);
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
        console.warn(`[TestRunner] No configuration file detected!`);
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
                    return;
                });
            } catch {
                console.warn(`[TestRunner] Could not find PHPUnit target directory at location: ${settingValue}`);
            }
        }

        // Fall back to use workspace folder as the default location
        if (this.phpUnitTargetPath.trim().length <= 0) {
            this.phpUnitTargetPath = workspaceFolder.uri.fsPath;
        }
    }
}