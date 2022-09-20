import * as vscode from "vscode";

export enum ItemType {
    folder,
    class,
    method,
    testsuite
}

export class TestItemDefinition {
    private type: ItemType;
    private workspaceFolderUri: vscode.Uri;

    constructor(type: ItemType, workspaceFolderUri: vscode.Uri) {
        this.type = type;
        this.workspaceFolderUri = workspaceFolderUri;
    }

    public getType(): ItemType
    {
        return this.type;
    }
    
    public getWorkspaceFolderUri(): vscode.Uri {
        return this.workspaceFolderUri;
    }
}