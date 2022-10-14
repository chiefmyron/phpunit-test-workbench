import * as vscode from 'vscode';

export class TestSuite {
    private workspaceFolderUri: vscode.Uri;
    private configFileUri: vscode.Uri;
    private configDirectoryUri: vscode.Uri;
    private name: string;
    private files: string[];
    private directories: string[];
    private directoryTestFileSuffixMap: Map<string, string>;

    constructor(workspaceFolderUri: vscode.Uri, configFileUri: vscode.Uri, name: string) {
        this.workspaceFolderUri = workspaceFolderUri;
        this.configFileUri = configFileUri;
        this.name = name;
        this.files = [];
        this.directories = [];
        this.directoryTestFileSuffixMap = new Map<string, string>();

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

    public getFiles(): string[] {
        return this.files;
    }

    public getDirectories(): string[] {
        return this.directories;
    }

    public getDirectoryTestFileSuffix(path: string) {
        return this.directoryTestFileSuffixMap.get(path);
    }

    public addFile(file: string) {
        this.files.push(file);
    }

    public addDirectory(path: string, testFileSuffix?: string) {
        // Clean up directory path
        if (path.startsWith('./')) {
            path = path.replace('./', '');  // Relative paths do not require leading './'
        }
        if (path.endsWith('/')) {
            path = path.substring(0, path.length - 1); // Trim trailing '/' character
        }

        this.directories.push(path);
        if (testFileSuffix) {
            this.directoryTestFileSuffixMap.set(path, testFileSuffix);
        }
    }

    public getGlobsForTestSuiteItems(testSuffixGlob: string): vscode.RelativePattern[] {
        let patterns: vscode.RelativePattern[] = [];
                        
        // Build watchers for directories identified in each test suite
        for (let directory of this.getDirectories()) {
            // Determine glob pattern for directory
            let patternString;
            if (this.getDirectoryTestFileSuffix(directory)) {
                patternString = directory + '/**/*' + this.getDirectoryTestFileSuffix(directory);
            } else {
                patternString = directory + '/**/' + testSuffixGlob;
            }

            patterns.push(new vscode.RelativePattern(this.getConfigDirectoryUri(), patternString));
        }

        // Build watchers for files identified in each test suite
        for (let file of this.getFiles()) {
            // If file has been specified as a relative path, remove the leading './'
            if (file.startsWith('./')) {
                file = file.replace('./', ''); 
            }

            // Use the filename as the glob for a direct match
            patterns.push(new vscode.RelativePattern(this.getConfigDirectoryUri(), file));
        }

        return patterns;
    }
}