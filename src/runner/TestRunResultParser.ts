import { TestRunResultItem, TestRunResultStatus } from "./TestRunResultItem";
import * as vscode from 'vscode';
import { Logger } from "../output";
import { generateTestItemId } from "../parser/TestFileParser";
import { ItemType } from "../parser/TestItemDefinition";
import { TestRunResult } from "./TestRunResult";

const patternTestStarted = new RegExp(/##teamcity\[testStarted /);
const patternTestFailed = new RegExp(/##teamcity\[testFailed /);
const patternTestIgnored = new RegExp(/##teamcity\[testIgnored /);
const patternTestFinished = new RegExp(/##teamcity\[testFinished /);
const patternTestAttribName = new RegExp(/##teamcity.*name='(.*?)'/);
const patternTestAttribLocationHint = new RegExp(/##teamcity.*locationHint='php_qn:\/\/(.*?)'/);
const patternTestAttribMessage = new RegExp(/##teamcity.*message='(.*?)'/);
const patternTestAttribDetails = new RegExp(/##teamcity.*details='(.*?)'/);
const patternTestAttribDuration = new RegExp(/##teamcity.*duration='(.*?)'/);
const patternTestAttribType = new RegExp(/##teamcity.*type='(.*?)'/);
const patternTestAttribActual = new RegExp(/##teamcity.*actual='(.*?)'/);
const patternTestAttribFlowId = new RegExp(/##teamcity.*flowId='(.*?)'/);
const patternSummaryOk = new RegExp(/OK \((\d*) tests, (\d*) assertions/);
const patternSummaryNotOk = new RegExp(/Tests: (\d*), Assertions: (\d*)/);
const patternSummaryNotOkSkipped = new RegExp(/Skipped: (\d*)/);
const patternSummaryNotOkFailures = new RegExp(/Failures: (\d*)/);
const patternSummaryNotOkErrors = new RegExp(/Errors: (\d*)/);
const patternFatalError = new RegExp(/Fatal error: (.*)/);

export class TestRunResultParser {
    private logger: Logger;
    private results: TestRunResult;

    constructor(logger: Logger) {
        this.logger = logger;
        this.results = new TestRunResult();
    }

    public parse(contents: string): TestRunResult {
        this.results.reset();
        const lines: string[] = contents.split(/\r\n|\r|\n/g);

        // Parse individual lines
        let result: TestRunResultItem | null = null;
        for (let line of lines) {
            // Fix escaped quote characters
            line = line.replace(new RegExp(/\|'/g), "\"");

            // Parse line
            let m: RegExpMatchArray | null;

            // Check if line matches 'Test started' string
            if (m = line.match(patternTestStarted)) {
                // Get test details
                let testName = line.match(patternTestAttribName)?.at(1);
                let testLocationHint = line.match(patternTestAttribLocationHint)?.at(1);

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
                    let testId = generateTestItemId(ItemType.method, testFilenameUri, testMethodName);
                    result = new TestRunResultItem(testId);
                    continue;
                }
            }

            // Check if line matches 'Test failed' string
            if (m = line.match(patternTestFailed)) {
                // Get test details and failure message
                let testMessage = line.match(patternTestAttribMessage)?.at(1);
                let testMessageDetail = line.match(patternTestAttribDetails)?.at(1);
                let testFailureType = line.match(patternTestAttribType)?.at(1);
                let testActualValue = line.match(patternTestAttribActual)?.at(1);

                // Get failure detail
                if (result) {
                    result.setMessage(testMessage);
                    result.setMessageDetail(testMessageDetail);
                    result.setTestFailureType(testFailureType);
                    result.setActualValue(testActualValue);
                    result.setStatus(TestRunResultStatus.failed);
                }
                continue;
            }

            // Check if line matches 'Test ignored' string
            if (m = line.match(patternTestIgnored)) {
                // Get test details and failure message
                let testMessage = line.match(patternTestAttribMessage)?.at(1);
                let testMessageDetail = line.match(patternTestAttribDetails)?.at(1);
                
                // Get failure detail
                if (result) {
                    result.setMessage(testMessage);
                    result.setMessageDetail(testMessageDetail);
                    result.setStatus(TestRunResultStatus.ignored);
                }
                continue;
            }

            // Check if line matches 'Test finished' string
            if (m = line.match(patternTestFinished)) {
                // Get test details and duration
                let testDuration = line.match(patternTestAttribDuration)?.at(1);
                
                // Add duration to existing result and add to results array
                
                if (result) {
                    if (result.getStatus() === TestRunResultStatus.unknown) {
                        result.setStatus(TestRunResultStatus.passed);
                    }
                    if (testDuration) {
                        result.setDuration(parseInt(testDuration));
                    }
                    this.results.addTestRunResultItem(result);
                }
                continue;
            }

            // Check if the line is a test run summary (with no failures, errors or skipped tests)
            if (m = line.match(patternSummaryOk)) {
                this.results.setNumTests(parseInt(m.at(1)!));
                this.results.setNumAssertions(parseInt(m.at(2)!));
                break;
            }

            // Check if the line is a test run summary (with one or more issues)
            if (m = line.match(patternSummaryNotOk)) {
                this.results.setNumTests(parseInt(m.at(1)!));
                this.results.setNumAssertions(parseInt(m.at(2)!));

                // Check for skipped tests
                if (m = line.match(patternSummaryNotOkSkipped)) {
                    this.results.setNumSkipped(parseInt(m.at(1)!));
                }

                // Check for failed tests
                if (m = line.match(patternSummaryNotOkFailures)) {
                    this.results.setNumFailed(parseInt(m.at(1)!));
                }

                // Check for errored tests
                if (m = line.match(patternSummaryNotOkErrors)) {
                    this.results.setNumErrors(parseInt(m.at(1)!));
                }
                break;
            }

            // Check if a fatal error occurred
            if (m = line.match(patternFatalError)) {
                let errorMessage = m.at(1)!;
                this.logger.error(`Fatal error occurred while running tests: ${errorMessage}\n`);
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