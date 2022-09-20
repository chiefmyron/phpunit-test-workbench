import * as vscode from 'vscode';

export class TestRunner {
    private pathPhpBinary: string = '';
    private pathPhpUnitBinary: string = '';
    private argsPhpUnitBinary: string[] = [];

    constructor(basePath: vscode.Uri) {
        // Set binary locations and arguments from workspace configuration
        const phpUnitConfig = vscode.workspace.getConfiguration('phpunit-test-workbench');
        console.log(phpUnitConfig);
    }
    
    private async getPhpUnitBinary(): Promise<string | void> {

    }
}