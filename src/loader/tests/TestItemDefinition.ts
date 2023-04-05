import * as vscode from "vscode";

export enum ItemType {
    testsuite = "TEST_SUITE",
    namespace = "NAMESPACE",
    class = "CLASS",
    method = "METHOD"
}

export class TestItemDefinition {
    private type: ItemType;
    private uri: vscode.Uri;
    private workspaceFolderUri?: vscode.Uri;
    private testSuiteName?: string;
    private testSuiteId?: string;
    private namespaceName?: string;
    private namespaceId?: string;
    private className?: string;
    private classLabel?: string;
    private classId?: string;
    private methodName?: string;
    private methodLabel?: string;
    private methodId?: string;
    private dataProvider?: string;
    private range?: vscode.Range;

    constructor(
        type: ItemType,
        uri: vscode.Uri,
        details: {
            testSuiteName?: string,
            testSuiteId?: string,
            namespaceName?: string,
            namespaceId?: string,
            className?: string,
            classLabel?: string,
            classId?: string,
            methodName?: string,
            methodLabel?: string,
            methodId?: string,
            dataProvider?: string
        }
    ) {
        this.type = type;
        this.uri = uri;
        this.testSuiteName = details.testSuiteName;
        this.testSuiteId = details.testSuiteId;
        this.namespaceName = details.namespaceName;
        this.namespaceId = details.namespaceId;
        this.className = details.className;
        this.classLabel = details.classLabel;
        this.classId = details.classId;
        this.methodName = details.methodName;
        this.methodLabel = details.methodLabel;
        this.methodId = details.methodId;
        this.dataProvider = details.dataProvider;
    }

    public getType(): ItemType {
        return this.type;
    }

    public getUri(): vscode.Uri {
        return this.uri;
    }

    public getTestSuiteName(): string | undefined {
        return this.testSuiteName;
    }

    public getTestSuiteId(): string | undefined {
        return this.testSuiteId;
    }

    public getNamespaceName(): string | undefined {
        return this.namespaceName;
    }

    public getNamespaceId(): string | undefined {
        return this.namespaceId;
    }

    public getClassName(): string | undefined {
        return this.className;
    }

    public getClassLabel(): string | undefined {
        if (this.classLabel) {
            return this.classLabel;
        }
        return this.className;
    }

    public getClassId(): string | undefined {
        return this.classId;
    }

    public getMethodName(): string | undefined {
        return this.methodName;
    }

    public getMethodLabel(): string | undefined {
        if (this.methodLabel) {
            return this.methodLabel;
        }
        return this.methodName;
    }

    public getMethodId(): string | undefined {
        return this.methodId;
    }

    public getDataProvider(): string | undefined {
        return this.dataProvider;
    }

    public getRange(): vscode.Range | undefined {
        return this.range;
    }

    public setRange(start: vscode.Position, end: vscode.Position) {
        this.range = new vscode.Range(start, end);
    }

    public getWorkspaceFolderUri(): vscode.Uri | undefined {
        return this.workspaceFolderUri;
    }

    public setWorkspaceFolderUri(uri: vscode.Uri) {
        this.workspaceFolderUri = uri;
    }

    public getPhpUnitId(): string {
        let id: string = '';

        if (this.namespaceName && (this.type === ItemType.namespace || this.type === ItemType.class || this.type === ItemType.method)) {
            id = this.namespaceName;
        } 
        
        if (this.className && (this.type === ItemType.class || this.type === ItemType.method)) {
            id = id + '\\' + this.className;
        } 
        
        if (this.methodName && this.type === ItemType.method) {
            id = id + '::' + this.methodName;
        }

        return id;
    }
}