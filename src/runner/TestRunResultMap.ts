import * as vscode from 'vscode';
import { TestResult, TestResultStatus } from './TestResult';

export class TestRunResultMap {
    private testItemResults: Map<vscode.TestItem, TestResult[]>;
    private numTestResults: number = 0;
    private numAssertions: number = 0;
    private numSkipped: number = 0;
    private numFailed: number = 0;
    private numErrors: number = 0;

    constructor() {
        this.testItemResults = new Map<vscode.TestItem, TestResult[]>();
    }

    public reset(): void {
        this.testItemResults.clear();
        this.numTestResults = 0;
        this.numAssertions = 0;
        this.numSkipped = 0;
        this.numFailed = 0;
        this.numErrors = 0;
    }

    public addResult(result: TestResult): vscode.TestMessage | undefined {
        let testItem = result.getTestItem();
        let resultArray = this.testItemResults.get(testItem);
        if (!resultArray) {
            resultArray = [];
        }
        resultArray.push(result);
        this.testItemResults.set(testItem, resultArray);

        let testMessage = undefined;

        // Update stats counters
        this.numTestResults++;
        switch (result.getStatus()) {
            case TestResultStatus.ignored:
            case TestResultStatus.skipped:
                this.numSkipped++;
                break;
            case TestResultStatus.failed:
                this.numFailed++;
                testMessage = this.createTestMessage(result);
                break;
            case TestResultStatus.error:
                this.numErrors++;
                testMessage = this.createTestMessage(result);
                break;
            default:
                break;
        }
        return testMessage;
    }

    public getNumTestResults(): number {
        return this.numTestResults;
    }

    public setNumTestResults(count: number): void {
        this.numTestResults = count;
    }

    public getNumAssertions(): number {
        return this.numAssertions;
    }

    public setNumAssertions(count: number): void {
        this.numAssertions = count;
    }

    public getNumSkipped(): number {
        return this.numSkipped;
    }

    public setNumSkipped(count: number): void {
        this.numSkipped = count;
    }

    public getNumFailed(): number {
        return this.numFailed;
    }

    public setNumFailed(count: number): void {
        this.numFailed = count;
    }

    public getNumErrors(): number {
        return this.numErrors;
    }

    public setNumErrors(count: number): void {
        this.numErrors = count;
    }

    public getNumTestItems(): number {
        return this.testItemResults.size;
    }

    public getTestItems(): IterableIterator<vscode.TestItem> {
        return this.testItemResults.keys();
    }

    public getTestStatus(testItem: vscode.TestItem): TestResultStatus {
        let status = TestResultStatus.unknown;
        let results = this.testItemResults.get(testItem);
        if (!results) {
            return status;
        }

        for (let result of results) {
            if (result.getStatus() > status) {
                status = result.getStatus();
            }
        }
        return status;
    }

    public getTestMessages(testItem: vscode.TestItem): vscode.TestMessage[] {
        let messages: vscode.TestMessage[] = [];
        let results = this.testItemResults.get(testItem);
        if (!results) {
            return messages;
        }

        messages = results.map(result => {
            return this.createTestMessage(result);
        });
        return messages;
    }

    public getTestDuration(testItem: vscode.TestItem): number {
        let duration = 0;
        let results = this.testItemResults.get(testItem);
        if (!results) {
            return duration;
        }

        for (let result of results) {
            duration = duration + result.getDuration();
        }
        return duration;
    }

    public getTestResults(testItem: vscode.TestItem): TestResult[] {
        let results = this.testItemResults.get(testItem);
        if (!results) {
            results = [];
        }
        return results;
    }

    private createTestMessage(result: TestResult): vscode.TestMessage {
        let message = new vscode.MarkdownString();
        let dataSetIdentifier = result.getDataSetIdentifier();
        if (dataSetIdentifier) {
            message.appendMarkdown(`### ${result.getMessage()} _(with data set #${dataSetIdentifier})_`);
        } else {
            message.appendMarkdown(`### ${result.getMessage()}`);
        }

        // Include the failure type if present
        if (result.getFailureType()) {
            message.supportHtml = true;
            message.appendMarkdown(`\n\n**Failure type:** \`${result.getFailureType()}\``);
        }

        // If only the actual value is present, we cannot display as a diff - include the actual value in the markdown
        let expectedValue = this.formatTestValue(result.getExpectedValue());
        let actualValue = this.formatTestValue(result.getActualValue());
        if (!expectedValue && actualValue) {
            message.appendMarkdown(`\n\n**Actual value:** ${actualValue}`);
        }

        // Create TestMessage
        let testMessage = new vscode.TestMessage(message);
        testMessage.expectedOutput = expectedValue;
        testMessage.actualOutput = actualValue;
        return testMessage;
    }

    private formatTestValue(value?: string): string | undefined {
        if (!value) {
            return value;
        }

        let valueLines = value.split(new RegExp(/\n/g));
        if (valueLines.length > 1) {
            return `<pre>${value}</pre>`;
        }
        return value;
    }
}