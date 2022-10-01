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

    private namespace?: string;
    private classname?: string;
    private method?: string;

    constructor(type: ItemType, workspaceFolderUri: vscode.Uri, details: { namespace?: string, classname?: string, method?: string}) {
        this.type = type;
        this.workspaceFolderUri = workspaceFolderUri;
        this.namespace = details.namespace;
        this.classname = details.classname;
        this.method = details.method;
    }

    public getType(): ItemType
    {
        return this.type;
    }
    
    public getWorkspaceFolderUri(): vscode.Uri {
        return this.workspaceFolderUri;
    }

    public getPhpUnitId(): string {
        let id: string = '';

        if (this.type === ItemType.folder || this.type === ItemType.class || this.type === ItemType.method) {
            if (this.namespace) {
                id = this.namespace;
            }
        } 
        
        if (this.type === ItemType.class || this.type === ItemType.method) {
            if (this.classname) {
                id = id + '\\' + this.classname;
            }
        } 
        
        if (this.type === ItemType.method) {
            if (this.method) {
                id = id + '::' + this.method;
            }
        }

        return id;
    }

    public getNamespace(): string {
        if (!this.namespace) {
            return '';
        }
        return this.namespace;
    }

    public getClassname(): string {
        if (!this.classname) {
            return '';
        }
        return this.classname;
    }

    public getMethod(): string {
        if (!this.method) {
            return '';
        }
        return this.method;
    }
}