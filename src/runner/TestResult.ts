import * as vscode from 'vscode';

export enum TestResultStatus {
    unknown,
    started,
    skipped,
    ignored,
    incomplete,
    passed,
    risky,
    warning,
    failed,
    error
}

export class TestResult {
    private name: string;
    private className: string;
    private methodName: string;
    private testItem: vscode.TestItem;
    private status: TestResultStatus;
    private message: string | undefined;
    private messageDetail: string | undefined;
    private messagePosition: vscode.Position | undefined;
    private failureType: string | undefined;
    private expectedValue: string | undefined;
    private actualValue: string | undefined;
    private dataSetIdentifier: string | undefined;
    private stackTrace: vscode.TestMessageStackFrame[];
    private duration: number;

    constructor(name: string, testItem: vscode.TestItem) {
        this.name = name;
        this.testItem = testItem;
        this.status = TestResultStatus.unknown;
        this.duration = 0;
        this.className = '';
        this.methodName = '';
        this.stackTrace = [];
    }

    public markStarted(): void {
        this.status = TestResultStatus.started;
    }

    public markPassed(): void {
        this.status = TestResultStatus.passed;
    }

    public markIgnored(
        message?: string,
        messageDetail?: string
    ): void {
        this.status = TestResultStatus.ignored;
        this.setMessage(message);
        this.setMessageDetail(messageDetail);
    }

    public markFailed(
        message?: string,
        messageDetail?: string,
        failureType?: string,
        expectedValue?: string,
        actualValue?: string,
        dataSetIdentifier?: string
    ): void {
        this.status = TestResultStatus.failed;
        this.setMessage(message);
        this.setMessageDetail(messageDetail);
        this.setFailureType(failureType);
        this.setExpectedValue(expectedValue);
        this.setActualValue(actualValue);
        this.setDataSetIdentifier(dataSetIdentifier);
    }

    public markErrored(
        message?: string,
        messageDetail?: string,
        failureType?: string,
        expectedValue?: string,
        actualValue?: string,
        dataSetIdentifier?: string
    ): void {
        this.status = TestResultStatus.error;
        this.setMessage(message);
        this.setMessageDetail(messageDetail);
        this.setFailureType(failureType);
        this.setExpectedValue(expectedValue);
        this.setActualValue(actualValue);
        this.setDataSetIdentifier(dataSetIdentifier);
    }

    public getName(): string {
        return this.name;
    }

    public getTestItem(): vscode.TestItem {
        return this.testItem;
    }

    public getStatus(): TestResultStatus {
        return this.status;
    }

    public getMessage(): string | undefined {
        return this.message;
    }

    public getMessageDetail(): string | undefined {
        return this.messageDetail;
    }

    public getMessagePosition(): vscode.Position | undefined {
        return this.messagePosition;
    }

    public getFailureType(): string | undefined {
        return this.failureType;
    }

    public getExpectedValue(): string | undefined {
        return this.expectedValue;
    }

    public getActualValue(): string | undefined {
        return this.actualValue;
    }

    public getDataSetIdentifier(): string | undefined {
        return this.dataSetIdentifier;
    }

    public getDuration(): number {
        return this.duration;
    }

    public setDuration(duration: number): void {
        this.duration = duration;
    }

    public hasStackTrace(): boolean {
        return (this.stackTrace.length > 0);
    }

    public getStackTrace(): vscode.TestMessageStackFrame[] {
        return this.stackTrace;
    }

    public setTestFileDetails(methodName: string, className?: string) {
        this.methodName = methodName;
        if (className) {
            this.className = className;
        }
    }

    public getFullyQualifiedTestMethod() {
        if (this.methodName && this.className) {
            return `${this.className}::${this.methodName}`;
        }
        return `${this.testItem.uri!.fsPath}::${this.name}`;
    }

    private setMessage(message?: string): void {
        if (!message || message.length <= 0) {
            return;
        }

        // Replace linebreak characters and remove trailing spaces or linebreaks
        message = this.parseEscapedTeamcityString(message);
        this.message = message;
    }

    private setMessageDetail(messageDetail?: string): void {
        if (!messageDetail || messageDetail.length <= 0) {
            return;
        }

        // Replace linebreak characters and remove trailing spaces or linebreaks
        messageDetail = this.parseEscapedTeamcityString(messageDetail);

        // Check for specific error location (line number)
        let messageDetailLines = messageDetail.split("\r\n").map(path => path.trim());
        while (messageDetailLines.length) {
            let messageLine = messageDetailLines.pop();
            if (messageLine && messageLine.indexOf(':') > 0) {
                let messageLineParts = messageLine.split(':');
                let lineNumStr = messageLineParts.pop();
                let filePathStr = messageLineParts.join(':');  // Handle Windows paths, which include a : in the drive assignment
                let messageLineUri = vscode.Uri.file(filePathStr);
                let messageLinePosition = new vscode.Position(Number(lineNumStr) - 1, 0);

                // Add as a stack trace frame
                let frame = new vscode.TestMessageStackFrame(
                    'label',
                    messageLineUri,
                    messageLinePosition
                );
                this.stackTrace.push(frame);

                // If the error reported is from within the test item code, set the message line number
                if (messageLineUri.fsPath === this.testItem.uri?.fsPath) {
                    if(this.testItem.range?.contains(messageLinePosition)) {
                        this.messagePosition = messageLinePosition;
                    }
                }
            }
        }
        this.messageDetail = messageDetail;
    }

    private setFailureType(failureType?: string): void {
        if (!failureType || failureType.length <= 0) {
            return;
        }
        this.failureType = failureType;
    }

    private setExpectedValue(expectedValue?: string): void {
        if (!expectedValue || expectedValue.length <= 0) {
            return;
        }
        this.expectedValue = this.parseEscapedTeamcityString(expectedValue);
    }

    private setActualValue(actualValue?: string): void {
        if (!actualValue || actualValue.length <= 0) {
            return;
        }
        this.actualValue = this.parseEscapedTeamcityString(actualValue);
    }

    private setDataSetIdentifier(dataSetIdentifier?: string): void {
        if (!dataSetIdentifier || dataSetIdentifier.length <= 0) {
            return;
        }
        this.dataSetIdentifier = dataSetIdentifier;
    }

    private parseEscapedTeamcityString(value: string): string {
        // Replace escaped characters
        value = value.replace(/\|'/g, '\'');       // Single quote characters
        value = value.replace(/\|"/g, '\"');       // Double quote characters
        value = value.replace(/\|\[/g, '\[');      // Open square bracket
        value = value.replace(/\|\]/g, '\]');      // Close square bracket
        value = value.replace(/\|r\|n/g, '\r\n');  // Carriage return + line break
        value = value.replace(/\|n/g, '\r\n');     // Line break only
        return value.trim();
    }
}