import * as vscode from 'vscode';

export enum TestRunResultStatus {
    unknown,
    started,
    passed,
    skipped,
    incomplete,
    failed,
    error,
    risky,
    warning,
    ignored
}

export class TestRunResultItem {
    private status: TestRunResultStatus;
    private testItem: vscode.TestItem;
    private message: string | undefined;
    private messageDetail: string | undefined;
    private messageLineItem: number | undefined;
    private testFailureType: string | undefined;
    private actualValue: string | undefined;
    private duration: number;

    constructor(testItem: vscode.TestItem) {
        this.testItem = testItem;
        this.status = TestRunResultStatus.unknown;
        this.duration = 0;
    }

    public setStarted() {
        this.setStatus(TestRunResultStatus.started);
    }

    public setFailed(message?: string, messageDetail?: string, failureType?: string, actualValue?: string): void {
        this.setMessage(message);
        this.setMessageDetail(messageDetail);
        this.setTestFailureType(failureType);
        this.setActualValue(actualValue);
        this.setStatus(TestRunResultStatus.failed);
    }

    public setIgnored(message?: string, messageDetail?: string) {
        this.setMessage(message);
        this.setMessageDetail(messageDetail);
        this.setStatus(TestRunResultStatus.ignored);
    }

    public setPassed() {
        this.setStatus(TestRunResultStatus.passed);
    }

    public getTestItem(): vscode.TestItem {
        return this.testItem;
    }

    public getTestItemId(): string
    {
        return this.testItem.id;
    }
    
    public getStatus(): TestRunResultStatus {
        return this.status;
    }

    public setStatus(status: TestRunResultStatus) {
        this.status = status;
    }

    public getMessage(): string {
        if (this.message) {
            return this.message;
        }
        return '';
    }

    public setMessage(message: string | undefined): void {
        // Parse message
        if (message) {
            // Replace linebreak characters
            message = message.replace(/\|n/g, " ");
        }
        this.message = message;
    }

    public getMessageDetail(): string {
        if (this.messageDetail) {
            return this.messageDetail;
        }
        return '';
    }

    public setMessageDetail(messageDetail: string| undefined): void {
        // Parse message detail
        if (messageDetail) {
            // Replace linebreak characters and remove trailing spaces or linebreaks
            messageDetail = messageDetail.trim();
            messageDetail = messageDetail.replace(/\|n$/, '');
            messageDetail = messageDetail.replace(/\|n/g, "\n");

            // Check for specific error location (line number)
            let messageDetailLines = messageDetail.split("\n"); 
            let messageLine = messageDetailLines.pop();
            if (messageLine && messageLine.indexOf(':') > 0) {
                let messageLineParts = messageLine.split(':');
                this.messageLineItem = Number(messageLineParts.pop());
            }
        }
        this.messageDetail = messageDetail;
    }

    public getMessageLineItem(): number {
        if (this.messageLineItem) {
            return this.messageLineItem;
        }
        return 0;
    }

    public getDuration(): number {
        return this.duration;
    }

    public setDuration(duration: number): void {
        this.duration = duration;
    }

    public getTestFailureType(): string {
        if (this.testFailureType) {
            return this.testFailureType;
        }
        return '';
    }

    public setTestFailureType(failureType: string | undefined): void {
        this.testFailureType = failureType;
    }

    public getActualValue(): string {
        if (this.actualValue) {
            return this.actualValue;
        }
        return '';
    }

    public setActualValue(value: string | undefined): void {
        if (value) {
            // Replace linebreak characters and remove trailing spaces or linebreaks
            value = value.trim();
            value = value.replace(/\|n$/, '');
            value = value.replace(/\|n/g, "\n");
        }

        this.actualValue = value;
    }

    public getTestMessage(): vscode.TestMessage {
        let message = new vscode.MarkdownString();
        message.appendMarkdown(`### ${this.message}`);
        if (this.testFailureType && this.testFailureType.length > 0) {
            message.supportHtml = true;
            message.appendMarkdown('\n\n**Failure type:** `' + this.testFailureType +'`');
        }
        if (this.actualValue && this.actualValue.length > 0) {
            let actualValuesLines = this.actualValue.split(new RegExp(/\n/g));

            message.supportHtml = true;
            message.appendMarkdown('  \n**Actual value:** ');
            if (actualValuesLines.length > 1) {
                message.appendMarkdown('<pre>' + this.actualValue + '</pre>');
            } else {
                message.appendMarkdown('`' + this.actualValue + '`');
            }
        }

        return new vscode.TestMessage(message);
    }
}