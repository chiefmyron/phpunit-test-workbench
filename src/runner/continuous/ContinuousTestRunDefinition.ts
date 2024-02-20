import * as vscode from "vscode";

export class ContinuousTestRunDefinition {
    private parentTestRunRequest: vscode.TestRunRequest;
    private cancellationToken: vscode.CancellationToken;
    private fileWatcherPattern: vscode.RelativePattern;
    private debug: boolean;

    constructor(
        parentTestRunRequest: vscode.TestRunRequest,
        cancellationToken: vscode.CancellationToken,
        fileWatcherPattern: vscode.RelativePattern,
        debug: boolean
    ) {
        this.parentTestRunRequest = parentTestRunRequest;
        this.cancellationToken = cancellationToken;
        this.fileWatcherPattern = fileWatcherPattern;
        this.debug = debug;
    }

    public createTestRunRequest(): vscode.TestRunRequest {
        return new vscode.TestRunRequest(
            this.parentTestRunRequest.include,
            this.parentTestRunRequest.exclude,
            this.parentTestRunRequest.profile,
            false
        );
    }

    public isDebug(): boolean {
        return this.debug;
    }

    public getCancellationToken(): vscode.CancellationToken {
        return this.cancellationToken;
    }

    public getFileWatcherPattern(): vscode.RelativePattern {
        return this.fileWatcherPattern;
    }

    public getParentTestRunRequest(): vscode.TestRunRequest {
        return this.parentTestRunRequest;
    }
}