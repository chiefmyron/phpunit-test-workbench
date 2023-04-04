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
    private testItem: vscode.TestItem;
    private status: TestResultStatus;
    private message: string | undefined;
    private messageDetail: string | undefined;
    private messageLineNum: number | undefined;
    private failureType: string | undefined;
    private expectedValue: string | undefined;
    private actualValue: string | undefined;
    private dataSetIdentifier: string | undefined;
    private duration: number;

    constructor(testItem: vscode.TestItem) {
        this.testItem = testItem;
        this.status = TestResultStatus.unknown;
        this.duration = 0;
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

    public getMessageLineNum(): number | undefined {
        return this.messageLineNum;
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

    private setMessage(message?: string): void {
        if (!message || message.length <= 0) {
            return;
        }

        // Replace linebreak characters
        message = message.replace(/\|n/g, " ");
        this.message = message;
    }

    private setMessageDetail(messageDetail?: string): void {
        if (!messageDetail || messageDetail.length <= 0) {
            return;
        }

        // Replace linebreak characters and remove trailing spaces or linebreaks
        messageDetail = messageDetail.trim();
        messageDetail = messageDetail.replace(/\|n$/, '');
        messageDetail = messageDetail.replace(/\|n/g, "\n");

        // Check for specific error location (line number)
        let messageDetailLines = messageDetail.split("\n"); 
        let messageLine = messageDetailLines.pop();
        if (messageLine && messageLine.indexOf(':') > 0) {
            let messageLineParts = messageLine.split(':');
            this.messageLineNum = Number(messageLineParts.pop());
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
        this.expectedValue = this.parseTestValue(expectedValue);
    }

    private setActualValue(actualValue?: string): void {
        if (!actualValue || actualValue.length <= 0) {
            return;
        }
        this.actualValue = this.parseTestValue(actualValue);
    }

    private setDataSetIdentifier(dataSetIdentifier?: string): void {
        if (!dataSetIdentifier || dataSetIdentifier.length <= 0) {
            return;
        }
        this.dataSetIdentifier = dataSetIdentifier;
    }

    private parseTestValue(value: string): string {
        // Replace linebreak characters and remove trailing spaces or linebreaks
        value = value.trim();
        value = value.replace(/\|n$/, '');
        value = value.replace(/\|n/g, "\n");
        return value;
    }
}