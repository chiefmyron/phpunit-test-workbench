import * as vscode from "vscode";

export class AutoloaderDefinition {
    private composerFileUri?: vscode.Uri;
    private workspaceFolder: vscode.WorkspaceFolder;
    private namespace: string;
    private directory: string;

    constructor(
        workspaceFolder: vscode.WorkspaceFolder,
        namespace: string,
        directory: string,
        composerFileUri?: vscode.Uri
    ) {
        this.workspaceFolder = workspaceFolder;
        this.namespace = namespace;
        this.directory = directory;
        this.composerFileUri = composerFileUri;
    }

    public getWorkspaceFolder(): vscode.WorkspaceFolder {
        return this.workspaceFolder;
    }

    public getNamespace(): string {
        return this.namespace;
    }

    public getDirectory(): string {
        return this.directory;
    }

    public getDirectoryUri(): vscode.Uri {
        if (this.composerFileUri) {
            // Directory will be relative to the location of composer.json
            return vscode.Uri.joinPath(this.composerFileUri, '../' + this.directory);
        }

        // Directory will be relative to the workspace folder root
        return vscode.Uri.joinPath(this.workspaceFolder.uri, this.directory);
    }

    public getComposerFileUri(): vscode.Uri | undefined {
        return this.composerFileUri;
    }
}