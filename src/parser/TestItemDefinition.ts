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
    private phpUnitId: string;

    constructor(type: ItemType, workspaceFolderUri: vscode.Uri, phpUnitId?: string) {
        this.type = type;
        this.workspaceFolderUri = workspaceFolderUri;
        if (phpUnitId) {
            this.phpUnitId = phpUnitId;
        } else {
            this.phpUnitId = '';
        }
    }

    public getType(): ItemType
    {
        return this.type;
    }
    
    public getWorkspaceFolderUri(): vscode.Uri {
        return this.workspaceFolderUri;
    }

    public getPhpUnitId(): string {
        return this.phpUnitId;
    }
}