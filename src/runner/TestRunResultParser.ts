import { TestRunResultItem, TestRunResultStatus } from "./TestRunResultItem";
import * as vscode from 'vscode';
import { Logger } from "../output";

const patternTestStarted = new RegExp(/##teamcity\[testStarted name='(.*)' locationHint='php_qn:\/\/(.*)' flowId='(.*)']/);
const patternTestFailed = new RegExp(/##teamcity\[testFailed name='(.*)' message='(.*)' details='(.*)' duration='(\d*)' flowId='(.*)']/);
const patternTestIgnored = new RegExp(/##teamcity\[testIgnored name='(.*)' message='(.*)' details='(.*)' duration='(\d*)' flowId='(.*)']/);
const patternTestFinished = new RegExp(/##teamcity\[testFinished name='(.*)' duration='(\d*)' flowId='(.*)']/);
const patternSummaryOk = new RegExp(/OK \((\d*) tests, (\d*) assertions/);
const patternSummaryFailed = new RegExp(/Tests: (\d*), Assertions: (\d*), Failures: (\d*)/);
const patternFatalError = new RegExp(/Fatal error: (.*)/);

export class TestRunResultParser {
    private logger: Logger;
    private results: TestRunResultItem[] = [];

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public parse(contents: string): TestRunResultItem[] {
        this.results = []; // Reset results list
        const lines: string[] = contents.split(/\r\n|\r|\n/g);

        // Parse individual lines
        let result: TestRunResultItem | null = null;
        for (const line of lines) {
            // Parse line
            let m: RegExpMatchArray | null;

            // Check if line matches 'Test started' string
            if (m = line.match(patternTestStarted)) {
                // Get test details
                let testName = m.at(1);
                let testLocationHint = m.at(2);

                // Parse location hint to build up ID for test item
                let testFilename = '';
                let testClassName = '';
                let testMethodName = '';
                let testLocationHintParts = testLocationHint?.split('::');
                if (testLocationHintParts) {
                    testFilename = testLocationHintParts[0];
                    testClassName = testLocationHintParts[1];
                    testMethodName = testLocationHintParts[2];

                    // Convert test filename into a URI
                    let testFilenameUri = vscode.Uri.file(testFilename);
                    
                    // Create new test run result item to store result
                    let testId = testFilenameUri.toString() + '::' + testMethodName;
                    result = new TestRunResultItem(testId);
                    continue;
                }
            }

            // Check if line matches 'Test failed' string
            if (m = line.match(patternTestFailed)) {
                // Get failure detail
                if (result) {
                    result.setMessage(m.at(2));
                    result.setMessageDetail(m.at(3));
                    result.setStatus(TestRunResultStatus.failed);
                }
                continue;
            }

            // Check if line matches 'Test ignored' string
            if (m = line.match(patternTestIgnored)) {
                // Get failure detail
                if (result) {
                    result.setMessage(m.at(2));
                    result.setMessageDetail(m.at(3));
                    result.setStatus(TestRunResultStatus.ignored);
                }
                continue;
            }

            // Check if line matches 'Test finished' string
            if (m = line.match(patternTestFinished)) {
                // Add duration to existing result and add to results array
                let duration = parseInt(m.at(2)!);
                if (result) {
                    if (result.getStatus() === TestRunResultStatus.unknown) {
                        result.setStatus(TestRunResultStatus.passed);
                    }
                    result.setDuration(duration);
                    this.results.push(result);
                }
                continue;
            }

            // Check if the line is a test run summary
            if (m = line.match(patternSummaryOk)) {
                let numTests = parseInt(m.at(1)!);
                let numAssertions = parseInt(m.at(2)!);
                this.logger.info(`Test run completed successfully! (${numTests} tests, ${numAssertions} assertions)`);
                break;
            }

            // Check if the line is a test run summary (with failed tests)
            if (m = line.match(patternSummaryFailed)) {
                let numTests = parseInt(m.at(1)!);
                let numAssertions = parseInt(m.at(2)!);
                let numFailures = parseInt(m.at(3)!);
                this.logger.error(`Test run completed with failures! (${numTests} tests, ${numAssertions} assertions, ${numFailures} failures)`);
                break;
            }

            // Check if a fatal error occurred
            if (m = line.match(patternFatalError)) {
                let errorMessage = m.at(1)!;
                this.logger.error(`Fatal error occurred while running tests: ${errorMessage}`);
                vscode.window.showErrorMessage('Fatal error occurred while executing PHPUnit test run', { detail: errorMessage, modal: false }, 'View output').then(item => {
                    if (item === 'View output') {
                        this.logger.showOutputChannel();
                    }
                });
                break;
            }
        }

        return this.results;
    }
}