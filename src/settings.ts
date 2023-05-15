import * as vscode from 'vscode';

export class Settings {
    private settings: Map<string, vscode.WorkspaceConfiguration>;

    constructor() {
        this.settings = new Map<string, vscode.WorkspaceConfiguration>();
    }

    public get(section: string, defaultValue?: any, scope?: vscode.ConfigurationScope) {
        // If scope has not been supplied, assume default scope
        let scopeId = '__DEFAULT__';
        if (scope) {
            scopeId = scope.toString();
        }

        // Check if settings have already been loaded for the scope
        if (this.settings.has(scopeId) !== true) {
            this.settings.set(scopeId, vscode.workspace.getConfiguration('phpunit-test-workbench', scope));
        }

        let settings = this.settings.get(scopeId)!;
        return settings.get(section, defaultValue);
    }

    public refresh() {
        this.settings.clear();
    }

    public getTestDirectory(workspaceFolder?: vscode.WorkspaceFolder): string {
        return this.get('phpunit.testDirectory', 'tests', workspaceFolder);
    }

    public getTestSuffixes(workspaceFolder?: vscode.WorkspaceFolder): string[] {
        let testFileSuffixes: string = this.get('phpunit.testFileSuffix', 'Test.php,.phpt', workspaceFolder);
        return testFileSuffixes.split(',');
    }

    public getTestSuffixGlob(workspaceFolder?: vscode.WorkspaceFolder): string {
        let testFileSuffixes = this.getTestSuffixes(workspaceFolder);
        testFileSuffixes.map((value: string, index: number) => { testFileSuffixes[index] = '*' + value; });
        return '{' + testFileSuffixes.join(',') + '}';
    }

    public getTestLocatorPattern(workspaceFolder: vscode.WorkspaceFolder): vscode.RelativePattern {
        let pattern = this.getTestDirectory(workspaceFolder) + '/**/' + this.getTestSuffixGlob(workspaceFolder);
        return new vscode.RelativePattern(workspaceFolder, pattern);
    }

    public getComposerJsonLocatorPattern(workspaceFolder: vscode.WorkspaceFolder): vscode.RelativePattern {
        let pattern = this.get('php.locatorPatternComposerJson', 'composer.json', workspaceFolder);
        return new vscode.RelativePattern(workspaceFolder, pattern);
    }

    public getPhpUnitConfigXmlLocatorPattern(workspaceFolder: vscode.WorkspaceFolder): vscode.RelativePattern {
        let pattern = this.get('phpunit.locatorPatternConfigXml', 'phpunit.xml', workspaceFolder);
        return new vscode.RelativePattern(workspaceFolder, pattern);
    }

    public getTestNamespacePrefix(workspaceFolder?: vscode.WorkspaceFolder): string {
        let prefix: string = this.get('phpunit.testNamespacePrefix', '', workspaceFolder);
        return prefix;
    }

    public isUsingTestSuiteDefinitions(workspaceFolder?: vscode.WorkspaceFolder): boolean {
        if (this.get('phpunit.useTestSuiteDefinitions', false, workspaceFolder) === true) {
            return true;
        }
        return false;
    }

    public isOrganizedByNamespace(): boolean {
        if (this.get('phpunit.testOrganization', 'file') === 'namespace') {
            return true;
        }
        return false;
    }
}