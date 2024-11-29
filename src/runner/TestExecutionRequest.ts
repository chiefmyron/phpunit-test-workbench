import * as os from 'os';
import * as vscode from 'vscode';
import { Logger } from '../output';
import { Settings } from '../settings';
import { ItemType, TestItemDefinition } from '../loader/tests/TestItemDefinition';
import { exec } from 'child_process';

export class TestExecutionRequest {
    private settings: Settings;
    private logger: Logger;
    private workspaceFolder: vscode.WorkspaceFolder;
    private targetClassOrFolder?: vscode.Uri;
    private pathCoverageSourceFolder?: vscode.Uri;
    private pathCoverageOutputFile?: vscode.Uri;
    private argsEnv: Map<string, string>;
    private argsPhp: Map<string, string>;
    private argsPhpUnit: Map<string, string>;
    private pathBinaryPhp: string;
    private pathBinaryPhpUnit: string;
    private pathConfigPhpUnit: string;

    constructor(settings: Settings, workspaceFolder: vscode.WorkspaceFolder, logger: Logger) {
        this.settings = settings;
        this.workspaceFolder = workspaceFolder;
        this.logger = logger;
        this.argsEnv = new Map<string, string>();
        this.argsPhp = new Map<string, string>();
        this.argsPhpUnit = new Map<string, string>();
        this.pathBinaryPhp = '';
        this.pathBinaryPhpUnit = '';
        this.pathConfigPhpUnit = '';
    }

    public static async createForWorkspaceFolder(
        workspaceFolder: vscode.WorkspaceFolder,
        settings: Settings,
        logger: Logger,
        coverage: boolean = false,
        tagId?: string
    ): Promise<TestExecutionRequest | undefined> {
        // If running with code coverage, check that a coverage driver has been selected
        if (coverage && settings.get('phpunit.coverageDriver', 'none') === 'none') {
            logger.warn(`No code coverage driver selected in extension settings`);
            return;
        }

        // Create initial request
        let request = new TestExecutionRequest(settings, workspaceFolder, logger);

        // If the test queue is being run for a specific tag
        if (tagId) {
            request.setParamsForTag(tagId);
        }

        // If the test queue is being run with code coverage
        if (coverage) {
            await request.setParamsForCodeCoverage();
        }

        return request;
    }

    public static async createForTestItem(
        item: vscode.TestItem,
        definition: TestItemDefinition,
        settings: Settings,
        logger: Logger,
        coverage: boolean = false,
        tagId?: string
    ): Promise<TestExecutionRequest | undefined> {
        if (!item.uri) {
            logger.warn(`Target TestItem does not have a valid URI and cannot be executed`);
            return;
        }

        // Determine workspace folder for target TestItem
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(item.uri);
        if (!workspaceFolder) {
            logger.warn(`Unable to locate workspace folder for ${item.uri}`);
            return;
        }

        // If running with code coverage, check that a coverage driver has been selected
        if (coverage && settings.get('phpunit.coverageDriver', 'none') === 'none') {
            logger.warn(`No code coverage driver selected in extension settings`);
            return;
        }

        // Create initial request
        let request = new TestExecutionRequest(settings, workspaceFolder, logger);

        // Add filters
        if (definition.getType() === ItemType.namespace) {
            request.setTargetClassOrFolder(item.uri);
        } else if (definition.getType() === ItemType.class) {
            request.setTargetClassOrFolder(item.uri);
        } else if (definition.getType() === ItemType.method) {
            let dataProviders = definition.getDataProviders();
            if (dataProviders.length > 0) {
                const phpUnitVersion = await request.getPhpUnitVersion();
                
                if (phpUnitVersion >= 10) {
                    request.setArgPhpUnit('--filter', new RegExp('::' + definition.getMethodName() + '($| with data set #\\d+$)').source);
                } else if (phpUnitVersion >= 7) {
                    request.setArgPhpUnit('--filter', definition.getMethodName() + '.*');
                } else {
                    request.setArgPhpUnit('--filter', '/' + definition.getMethodName() + '($| with data set #\d+$)/');
                }
            } else {
                request.setArgPhpUnit('--filter', definition.getMethodName() + '$');
            }
            
            request.setTargetClassOrFolder(item.uri!);
        }

        // If the test queue is being run under a test suite
        if (definition.getTestSuiteName()) {
            request.setArgPhpUnit('--testsuite', `${definition.getTestSuiteName()}`);
        }

        // If the test queue is being run for a specific tag
        if (tagId) {
            request.setParamsForTag(tagId);
        }

        // If the test queue is being run with code coverage
        if (coverage) {
            await request.setParamsForCodeCoverage();
        }

        return request;
    }

    public setParamsForTag(tagId: string) {
        this.setArgPhpUnit('--group', tagId);
    }

    public async setParamsForCodeCoverage() {
        let driver = this.settings.get('phpunit.coverageDriver', 'none');
        let sourceFolder = this.settings.get('phpunit.coverageSourceDirectory');
        let outputFolder = this.settings.get('phpunit.coverageOutputDirectory');

        // Determine the top level source folder to run coverage analysis against
        let sourceFolders = [
            this.workspaceFolder.uri.with({ path: this.workspaceFolder.uri.path + '/src' }),
            this.workspaceFolder.uri.with({ path: this.workspaceFolder.uri.path + '/lib' }),
            this.workspaceFolder.uri.with({ path: this.workspaceFolder.uri.path + '/app' }),
            this.workspaceFolder.uri
        ];
        if (sourceFolder && sourceFolder !== '') {
            sourceFolders.unshift(sourceFolder);
        }

        // Use the first found source folder
        for (let folder of sourceFolders) {
            try {
                await vscode.workspace.fs.stat(folder);
            } catch (error: any) {
                this.logger.info(`Code coverage source directory ${folder.fsPath} not found...`);
                if (error instanceof vscode.FileSystemError) {
                    this.logger.trace(error.message);
                }
                continue;
            }

            this.pathCoverageSourceFolder = folder;
            break;
        }

        if (!this.pathCoverageSourceFolder) {
            this.logger.warn('No valid directories found for code coverage source files! Test will be run without code coverage statistics being collected.');
            return;
        }

        // Set coverage driver-specific PHP environment options
        if (driver === 'xdebug') {
            this.setArgPhp('-dxdebug.mode', 'coverage');
        } else if (driver === 'pcov') {
            this.setArgPhp('-dpcov.enabled', '1');
            this.setArgPhp('-dpcov.directory', this.pathCoverageSourceFolder.fsPath);
        }

        // Set the output folder for the coverage file
        this.pathCoverageOutputFile = vscode.Uri.file(os.tmpdir());
        if (outputFolder) {
            this.pathCoverageOutputFile = vscode.Uri.file(outputFolder);
        }

        // Set PHPUnit options for enabling code coverage
        this.pathCoverageOutputFile = this.pathCoverageOutputFile.with({path: this.pathCoverageOutputFile.path + '/phpunit-coverage-' + Date.now() + '.xml'});
        this.setArgPhpUnit('--coverage-clover', this.pathCoverageOutputFile.fsPath);
        this.setArgPhpUnit('--coverage-filter', this.pathCoverageSourceFolder.fsPath);
        this.setArgPhpUnit('--path-coverage');
    }

    public getWorkspaceFolder(): vscode.WorkspaceFolder {
        return this.workspaceFolder!;
    }

    public getTargetClassOrFolder(): vscode.Uri | undefined {
        return this.targetClassOrFolder;
    }

    public getCoverageOutputFileUri(): vscode.Uri | undefined {
        return this.pathCoverageOutputFile;
    }

    public getArgsEnv(): Map<string, string> {
        return this.argsEnv;
    }

    public getArgsPhp(): Map<string, string> {
        return this.argsPhp;
    }

    public getArgsPhpUnit(): Map<string, string> {
        return this.argsPhpUnit;
    }

    public async getPathBinaryPhp(): Promise<string> {
        if (this.pathBinaryPhp === '') {
            this.pathBinaryPhp = await this.setPathBinaryPhp();
        }
        return this.pathBinaryPhp;
    }

    public async getPathBinaryPhpUnit(): Promise<string> {
        if (this.pathBinaryPhpUnit === '') {
            this.pathBinaryPhpUnit = await this.setPathBinaryPhpUnit();
        }
        return this.pathBinaryPhpUnit;
    }

    public async getPathConfigPhpUnit(): Promise<string> {
        if (this.pathConfigPhpUnit === '') {
            this.pathConfigPhpUnit = await this.setPathConfigPhpUnit();
        }
        return this.pathConfigPhpUnit;
    }

    public async hasPathConfigPhpUnit(): Promise<boolean> {
        let path = await this.getPathConfigPhpUnit();
        if (path.length > 0) {
            return true;
        }
        return false;
    }

    public setTargetClassOrFolder(target: vscode.Uri): void {
        this.targetClassOrFolder = target;
    }

    public setArgEnv(key:string, value?: string): void {
        if (!value) {
            value = '';
        }
        this.argsEnv.set(key, value);
    }

    public setArgPhp(key:string, value?: string): void {
        if (!value) {
            value = '';
        }
        this.argsPhp.set(key, value);
    }

    public setArgPhpUnit(key:string, value?: string): void {
        if (!value) {
            value = '';
        }
        this.argsPhpUnit.set(key, value);
    }

    public async getCommandString(): Promise<string> {
        let command = await this.getPathBinaryPhp();
        this.logger.info(`Using PHP binary path: ${command}`);
        return command;
    }

    public async getCommandArguments(): Promise<string[]> {
        // Array to hold command arguments
        // NOTE: Order of arguments is important!
        let args: string[] = [];

        // Add command-line arguments for PHP environment
        if (this.argsPhp.size > 0) {
            this.logger.info('Setting command line arguments for PHP environment:');
            for (const [key, value] of this.argsPhp) {
                if (value && value.length > 0) {
                    this.logger.info(`  ${key}=${value}`);
                    args.push(key + '=' + value);
                } else {
                    this.logger.info(`  ${key}`);
                    args.push(key);
                }
            }
        }

        // Add path to the PHPUnit entry point
        this.logger.info(`Using PHPUnit binary path: ${await this.getPathBinaryPhpUnit()}`);
        args.push(await this.getPathBinaryPhpUnit());

        // Set mandatory command-line arguments for all PHPUnit test runs
        this.setArgPhpUnit('--teamcity', '');
        if (await this.hasPathConfigPhpUnit()) {
            this.logger.info(`Using PHPUnit configuration file: ${await this.getPathConfigPhpUnit()}`);
            this.setArgPhpUnit('-c', await this.getPathConfigPhpUnit());
        }

        // Add command-line arguments for PHPUnit execution
        this.logger.info('Setting command line arguments for PHPUnit run:');
        for (const [key, value] of this.argsPhpUnit) {
            args.push(key);
            if (value && value.length > 0) {
                this.logger.info(`  ${key} ${value}`);
                args.push(value);
            } else {
                this.logger.info(`  ${key}`);
            }
        }

        // If we are not explicitly executing a defined test suite, specify the target folder to run tests from
        if (this.argsPhpUnit.has('--testsuite') === false) {
            let targetPath = this.getTargetClassOrFolder();
            if (!targetPath) {
                targetPath = await this.guessPhpUnitTargetPath();
            }

            this.logger.info(`Base location of test files included in test run: ${targetPath.fsPath}`);
            args.push(targetPath.fsPath);
        }
        
        return args;
    }

    private async setPathBinaryPhp(): Promise<string> {
        // If a setting has been provided, it has first priority
        let path = this.settings.get('php.binaryPath', undefined, this.workspaceFolder);
        if (path) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.parse(path));
                return path;
            } catch {
                this.logger.warn(`Could not find PHP binary specified in settings: ${path}`);
            }
        }

        // Setting was either not provided or not successful - assume binary is available via $PATH
        return 'php';
    }

    private async setPathBinaryPhpUnit(): Promise<string> {
        // Build an array of PHPUnit binary paths to check
        let phpUnitBinaryPathOptions: vscode.Uri[] = [];

        // If a setting has been provided, it has first priority
        let settingValue = this.settings.get('phpunit.binaryPath', undefined, this.workspaceFolder);
        if (settingValue) {
            phpUnitBinaryPathOptions.push(vscode.Uri.parse(settingValue));
            phpUnitBinaryPathOptions.push(vscode.Uri.parse(this.workspaceFolder!.uri.path + '/' + settingValue));
        }

        // Add fallback options
        phpUnitBinaryPathOptions.push(vscode.Uri.parse(this.workspaceFolder!.uri.path + '/vendor/phpunit/phpunit/phpunit'));
        phpUnitBinaryPathOptions.push(vscode.Uri.parse(this.workspaceFolder!.uri.path + '/phpunit.phar'));

        // Loop through the options and use the first one where the file actually exists
        for (let pathOption of phpUnitBinaryPathOptions) {
            try {
                await vscode.workspace.fs.stat(pathOption);
                return pathOption.fsPath;
            } catch {
                this.logger.warn(`Could not find PHPUnit binary specified in settings or in common fallback location: ${pathOption.fsPath}`);
            }
        }

        // No fallback options were successful - assume binary is available via $PATH
        if (process.platform === 'win32') {
            return 'phpunit.bat';
        } else {
            return 'phpunit';
        }
    }

    private async setPathConfigPhpUnit(): Promise<string> {
        // If a setting has been provided, it has first priority
        let patternStr = this.settings.get('phpunit.locatorPatternConfigXml', '{test,tests,Test,Tests}/phpunit.xml', this.workspaceFolder);
        let pattern = new vscode.RelativePattern(this.workspaceFolder!, patternStr);

        // Use the glob pattern to attempt to locate a phpunit.xml file - first file found will be used
        let path = await vscode.workspace.findFiles(pattern).then((files: vscode.Uri[]) => {
            for (let file of files) {
                return file.fsPath;
            }
            this.logger.warn(`No configuration file detected!`);
		});

        if (!path) {
            path = '';
        }
        return path;
    }

    private async guessPhpUnitTargetPath(): Promise<vscode.Uri> {
        // If a setting has been provided, it has first priority
        let workspaceFolder = this.workspaceFolder!;
        let settingValue = this.settings.get('phpunit.testDirectory', undefined, workspaceFolder);
        if (settingValue) {
            try {
                let targetPathUri = workspaceFolder.uri.with({ path: workspaceFolder.uri.path + '/' + settingValue });
                await vscode.workspace.fs.stat(targetPathUri);
                return targetPathUri;
            } catch {
                this.logger.warn(`Could not find PHPUnit target directory specified in settings: ${settingValue}`);
            }
        }

        // Fall back to use workspace folder as the default location
        return workspaceFolder.uri;
    }

    private async getPhpUnitVersion(): Promise<number> {
        try {
            const phpUnit = await this.getPathBinaryPhpUnit();
            const result = await new Promise<string>((resolve) => {
                exec(`${phpUnit} --version`, (_, stdout: string) => {
                    resolve(stdout);
                });
            });
            
            const versionMatch = result.match(/PHPUnit\s+(\d+)\./);
            return versionMatch ? parseInt(versionMatch[1]) : 0;
        } catch {
            return 0;
        }
    }
}