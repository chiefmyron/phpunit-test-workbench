import * as vscode from "vscode";

export enum ItemType {
    namespace = "NAMESPACE",
    class = "CLASS",
    method = "METHOD",
    testsuite = "TEST_SUITE"
}

export class TestItemDefinition {
    private type: ItemType;
    private workspaceFolderUri: vscode.Uri;
    private testsuite?: string;
    private namespace?: string;
    private classname?: string;
    private method?: string;

    constructor(type: ItemType, workspaceFolderUri: vscode.Uri, details: { testsuite?: string, namespace?: string, classname?: string, method?: string}) {
        this.type = type;
        this.workspaceFolderUri = workspaceFolderUri;
        this.testsuite = details.testsuite;
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

        if (this.type === ItemType.namespace || this.type === ItemType.class || this.type === ItemType.method) {
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

    public getTestSuite(): string {
        if (!this.testsuite) {
            return '';
        }
        return this.testsuite;
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