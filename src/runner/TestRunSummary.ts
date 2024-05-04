import * as vscode from 'vscode';
import { TestResult, TestResultStatus } from './TestResult';

export class TestRunSummary {
    // Totals reported by PHPUnit binary
    private reportedTotalTests: number = 0;
    private reportedTotalAssertions: number = 0;
    private reportedTotalFailures: number = 0;
    private reportedTotalWarnings: number = 0;
    private reportedTotalSkipped: number = 0;
    private reportedTotalErrors: number = 0;
    private reportedTotalRisky: number = 0;

    // Counts for test items recorded by the extension
    private actualTotalTests: number = 0;
    private actualTotalPassed: number = 0;
    private actualTotalFailures: number = 0;
    private actualTotalWarnings: number = 0;
    private actualTotalSkipped: number = 0;
    private actualTotalErrors: number = 0;

    // Tracker of test results
    private testItemResults: Map<vscode.TestItem, TestResult[]>;

    constructor() {
        this.testItemResults = new Map<vscode.TestItem, TestResult[]>;
    }

    public addTestResult(result: TestResult): vscode.TestMessage | undefined {
        // Get the underlying TestItem from the result
        let item = result.getTestItem();

        // If this is the first instance of a result for this test item (i.e. the first time the test method
        // has been executed, or the first instance of the test method being run across a data set), initialise 
        // result array now
        let results = this.testItemResults.get(item);
        if (!results) {
            results = [];
        }
        results.push(result);
        this.testItemResults.set(item, results);

        // Initialise test message to return for logging
        let message = undefined;

        // Update actual statistics
        this.actualTotalTests++;
        switch (result.getStatus()) {
            case TestResultStatus.passed:
                this.actualTotalPassed++;
                break;
            case TestResultStatus.ignored:
            case TestResultStatus.skipped:
                this.actualTotalSkipped++;
                break;
            case TestResultStatus.failed:
                this.actualTotalFailures++;
                message = this.createTestMessage(result);
                break;
            case TestResultStatus.error:
                this.actualTotalErrors++;
                message = this.createTestMessage(result);
                break;
            default:
                break;
        }

        // If a test failure or error occurred, set the location of the message to the location in the test where the failure occurred
        if (message) {
            let testFileUri = result.getTestItem().uri;
            let testFileLineNum = result.getMessageLineNum();
            if (testFileUri && testFileLineNum) {
                message.location = new vscode.Location(testFileUri, new vscode.Position((testFileLineNum - 1), 0));
            }
        }
        return message;
    }

    public setReportedSummaryCounts(total: number, assertions: number, failures: number, warnings: number, skipped: number, errors: number, risky: number) {
        this.reportedTotalTests = total;
        this.reportedTotalAssertions = assertions;
        this.reportedTotalFailures = failures;
        this.reportedTotalWarnings = warnings;
        this.reportedTotalSkipped = skipped;
        this.reportedTotalErrors = errors;
        this.reportedTotalRisky = risky;
    }

    public getReportedSummaryCounts() {
        return {
            tests: this.reportedTotalTests,
            assertions: this.reportedTotalAssertions,
            failures: this.reportedTotalFailures,
            warnings: this.reportedTotalWarnings,
            skipped: this.reportedTotalSkipped,
            errors: this.reportedTotalErrors,
            risky: this.reportedTotalRisky
        };
    }

    public getActualSummaryCounts() {
        return {
            tests: this.actualTotalTests,
            passed: this.actualTotalPassed,
            failures: this.actualTotalFailures,
            warnings: this.actualTotalWarnings,
            skipped: this.actualTotalSkipped,
            errors: this.actualTotalErrors
        };
    }

    public getTestItems(): IterableIterator<vscode.TestItem> {
        return this.testItemResults.keys();
    }

    public getTestItemStatus(testItem: vscode.TestItem): TestResultStatus {
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
    
    public getTestItemResults(testItem: vscode.TestItem): TestResult[] {
        let results = this.testItemResults.get(testItem);
        if (!results) {
            results = [];
        }
        return results;
    }

    private createTestMessage(result: TestResult): vscode.TestMessage {
        let message = new vscode.MarkdownString();
        message.supportHtml = true;

        // Display reported message
        message.appendMarkdown(`<pre>${result.getMessage()}</pre>`);

        // Include the data set identifier if present
        if (result.getDataSetIdentifier()) {
            message.appendMarkdown(`\n\n**Data set:** \`${result.getDataSetIdentifier()}\``);
        }
        
        // Include the failure type if present
        if (result.getFailureType()) {
            message.appendMarkdown(`\n\n**Failure type:** \`${result.getFailureType()}\``);
        }

        // If only the actual value is present, we cannot display as a diff - include the actual value in the markdown
        let expectedValue = result.getExpectedValue();
        let actualValue = result.getActualValue();
        if (!expectedValue && actualValue) {
            message.appendMarkdown(`\n\n**Actual value:** ${this.formatTestValue(actualValue)}`);
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

