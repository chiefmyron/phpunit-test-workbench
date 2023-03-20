import * as vscode from 'vscode';
import { TestSuite } from './TestSuite';

export class TestSuiteMap {
    private testSuiteMap: Map<string, TestSuite>;

    constructor() {
        this.testSuiteMap = new Map<string, TestSuite>();
    }

    public getWorkspaceTestSuites(workspaceFolder: vscode.WorkspaceFolder): TestSuite[] {
        const suites: TestSuite[] = [];
        this.testSuiteMap.forEach((suite, key) => {
            if (key.startsWith(workspaceFolder.uri.toString())) {
                suites.push(suite);
            }
        });
        return suites;
    }

    public add(workspaceFolder: vscode.WorkspaceFolder, suites: TestSuite[]) {
        for (let suite of suites) {
            this.set(workspaceFolder, suite);
        }
    }

    public set(workspaceFolder: vscode.WorkspaceFolder, suite: TestSuite) {
        let id = workspaceFolder.uri.toString() + '||' + suite.getName();
        this.testSuiteMap.set(id, suite);
    }

    public has(workspaceFolder: vscode.WorkspaceFolder, name: string) {
        let id = workspaceFolder.uri.toString() + '||' + name;
        return this.testSuiteMap.has(id);
    }

    public delete(workspaceFolder: vscode.WorkspaceFolder, name: string) {
        let id = workspaceFolder.uri.toString() + '||' + name;
        this.testSuiteMap.delete(id);
    }

    public deleteConfigFileTestSuites(configFileUri: vscode.Uri) {
        this.testSuiteMap.forEach((suite, key) => {
            if (suite.getConfigFileUri() === configFileUri) {
                this.testSuiteMap.delete(key);
            }
        });
    }

    public clear() {
        this.testSuiteMap.clear();
    }
}


