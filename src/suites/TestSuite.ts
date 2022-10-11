import * as vscode from 'vscode';

export class TestSuite {
    private workspaceFolderUri: vscode.Uri;
    private configFileUri: vscode.Uri;
    private configDirectoryUri: vscode.Uri;
    private name: string;
    private directories: string[];
    private files: string[];

    constructor(workspaceFolderUri: vscode.Uri, configFileUri: vscode.Uri, name: string, directories: string[], files: string[]) {
        this.workspaceFolderUri = workspaceFolderUri;
        this.configFileUri = configFileUri;
        this.name = name;
        this.directories = directories;
        this.files = files;

        // Extract config directory from the config file URI
        let configFileDirParts = configFileUri.path.split('/');
        configFileDirParts.pop(); // Remove config filename
        this.configDirectoryUri = configFileUri.with({ path: configFileDirParts.join('/') });
    }

    public getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(this.workspaceFolderUri);
    }

    public getWorkspaceFolderUri(): vscode.Uri {
        return this.workspaceFolderUri;
    }

    public getConfigFileUri(): vscode.Uri {
        return this.configFileUri;
    }

    public getConfigDirectoryUri(): vscode.Uri {
        return this.configDirectoryUri;
    }

    public getName(): string {
        return this.name;
    }

    public getDirectories(): string[] {
        return this.directories;
    }

    public getFiles(): string[] {
        return this.files;
    }

    public getGlobsForTestSuiteItems(testSuffixGlob: string): vscode.RelativePattern[] {
        let patterns: vscode.RelativePattern[] = [];
                        
        // Build watchers for directories identified in each test suite
        for (let directory of this.getDirectories()) {
            // Determine glob pattern for directory
            let patternString = directory + '/**/' + testSuffixGlob;
            patterns.push(new vscode.RelativePattern(this.getConfigDirectoryUri(), patternString));
        }

        // Build watchers for files identified in each test suite
        for (let file of this.getFiles()) {
            // Use the filename as the glob for a direct match
            patterns.push(new vscode.RelativePattern(this.getConfigDirectoryUri(), file));
        }

        return patterns;
    }
}