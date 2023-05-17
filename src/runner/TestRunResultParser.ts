import * as vscode from 'vscode';
import { Logger } from "../output";
import { generateTestItemId } from "../loader/tests/TestFileParser";
import { ItemType } from "../loader/tests/TestItemDefinition";
import { ResultParsingCompleteEvent } from './events/ResultParsingCompleteEvent';
import { Settings } from '../settings';
import { TestResult, TestResultStatus } from './TestResult';
import { TestRunResultMap } from './TestRunResultMap';

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
const patternTestAttribExpected = new RegExp(/##teamcity.*expected='(.*?)'/);
const patternTestAttribActual = new RegExp(/##teamcity.*actual='(.*?)'/);
const patternTestAttribDataSetNum = new RegExp(/##teamcity.*with data set \#(.*?)'/);
const patternSummaryOk = new RegExp(/OK \((\d*) (test|tests), (\d*) (assertion|assertions)\)/);
const patternSummaryNotOk = new RegExp(/(Test|Tests): (\d*), (Assertion|Assertions): (\d*)/);
const patternSummaryNotOkSkipped = new RegExp(/Skipped: (\d*)/);
const patternSummaryNotOkFailures = new RegExp(/Failures: (\d*)/);
const patternSummaryNotOkErrors = new RegExp(/Errors: (\d*)/);
const patternFatalError = new RegExp(/Fatal error: (.*)/);

export class TestRunResultParser extends vscode.EventEmitter<any> {
    private run: vscode.TestRun;
    private testItemQueue: Map<string, vscode.TestItem>;
    private settings: Settings;
    private logger: Logger;
    private messageQueue: string[];
    private result: TestResult | undefined;
    private resultMap: TestRunResultMap;
    private buffer: string;
    private _isParsing: boolean;
    private _onParsingComplete: vscode.EventEmitter<ResultParsingCompleteEvent>;

    constructor(
        run: vscode.TestRun,
        queue: Map<string, vscode.TestItem>,
        settings: Settings,
        logger: Logger
    ) {
        super();

        this.run = run;
        this.testItemQueue = queue;
        this.settings = settings;
        this.logger = logger;
        this.messageQueue = [];
        this.resultMap = new TestRunResultMap();
        this.buffer = '';
        this._isParsing = false;
        this._onParsingComplete = new vscode.EventEmitter<ResultParsingCompleteEvent>();
    }

    get onParsingComplete(): vscode.Event<ResultParsingCompleteEvent> {
        return this._onParsingComplete.event;
    }

    private enqueue(contents: string): void {
        this.messageQueue.push(contents);
    }

    private dequeue(): string | undefined {
        return this.messageQueue.shift();
    }

    private processMessageQueue() {
        this._isParsing = true;
        while (this.messageQueue.length > 0) {
            let content = this.dequeue();
            if (content) {
                this.parseContent(content);
            }
        }
        this._isParsing = false;
        this._onParsingComplete.fire(
            new ResultParsingCompleteEvent(this.resultMap)
        );
    }

    public reset(): void {
        this.resultMap.reset();
        this.messageQueue = [];
    }

    public isParsing(): boolean {
        return this._isParsing;
    }

    public parse(contents: string): void {
        this.enqueue(contents);
        if (this._isParsing === false) {
            this.processMessageQueue();
        }
    }

    private parseContent(contents: string): void {
        // If the buffer is not empty, append to existing content
        if (this.buffer.length > 0) {
            contents = this.buffer + contents;
            this.buffer = '';
        }

        // Parse individual lines
        const lines: string[] = contents.split(/\r\n|\r|\n/g);
        for (let line of lines) {
            // Fix escaped quote characters
            line = line.replace(new RegExp(/\|'/g), "\"");

            // Teamcity lines should start with '##' and finish with a closing ']'. If a teamcity line 
            // isn't completed correctly, it must only be partially printed - add to the buffer and
            // parse the complete line the next time around
            if (line.startsWith('#') === true && line.endsWith(']') !== true) {
                this.buffer = this.buffer + line;
                break;
            }

            // Parse line
            let m: RegExpMatchArray | null;

            // Check if line matches 'Test started' string
            if (m = line.match(patternTestStarted)) {
                this.result = this.processLineTestStarted(line);
                if (this.result) {
                    continue;
                }
            }

            // Check if line matches 'Test failed' string
            if (m = line.match(patternTestFailed)) {
                this.processLineTestFailed(line, this.result);
                continue;
            }

            // Check if line matches 'Test ignored' string
            if (m = line.match(patternTestIgnored)) {
                this.processLineTestIgnored(line, this.result);
                continue;
            }

            // Check if line matches 'Test finished' string
            if (m = line.match(patternTestFinished)) {
                this.processLineTestFinished(line, this.result);
                continue;
            }

            // Check if the line is a test run summary (with no failures, errors or skipped tests)
            if (m = line.match(patternSummaryOk)) {
                this.processLineTestSummaryOk(m);
                break;
            }

            // Check if the line is a test run summary (with one or more issues)
            if (m = line.match(patternSummaryNotOk)) {
                this.processLineTestSummaryNotOk(line, m);
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
    }

    public getResultMap(): TestRunResultMap {
        return this.resultMap;
    }

    private processLineTestStarted(line: string): TestResult | undefined {
        // Get test details
        let testName = line.match(patternTestAttribName)?.at(1);
        let testLocationHint = line.match(patternTestAttribLocationHint)?.at(1);

        // Parse location hint to build up ID for test item
        let testLocationHintParts = testLocationHint?.split('::');
        let result: TestResult | undefined;
        if (testLocationHintParts) {
            let testFilename = testLocationHintParts[0];
            let testClassName = testLocationHintParts[1];
            let testMethodName = testLocationHintParts[2];

            // Convert test filename into a URI
            let testFilenameUri = vscode.Uri.file(testFilename);
            
            // Create new test run result item to store result
            let testId = generateTestItemId(ItemType.method, testFilenameUri, testMethodName);
            let testItem = this.testItemQueue.get(testId);
            if (testItem) {
                // Create result item to track results for this test
                result = new TestResult(testItem);
                result.markStarted();

                // Update the test run to indicate the test has started
                this.run.started(testItem);
            } else {
                this.logger.warn('Unable to find test item for test: ' + testId);
            }
        } else {
            this.logger.warn('Unable to parse test location hint: ' + testLocationHint);
        }
        return result;
    }

    private processLineTestFailed(line: string, result?: TestResult): void {
        if (!result) {
            return;
        }

        // Get test details and failure message
        let message = line.match(patternTestAttribMessage)?.at(1);
        let messageDetail = line.match(patternTestAttribDetails)?.at(1);
        let failureType = line.match(patternTestAttribType)?.at(1);
        let expectedValue = line.match(patternTestAttribExpected)?.at(1);
        let actualValue = line.match(patternTestAttribActual)?.at(1);
        let dataSetIdentifier = line.match(patternTestAttribDataSetNum)?.at(1);

        // Update result item with failure details
        result.markFailed(message, messageDetail, failureType, expectedValue, actualValue, dataSetIdentifier);

        // Check settings to see whether we need to display the output window
        if (this.settings.get('log.autoDisplayOutput', 'testRunFailures') === 'testRunFailures') {
            this.logger.showOutputChannel();
        }

        // Print details to log
        this.logger.error(`❌ FAILED: ${result.getTestItem().id}`);
        this.logger.error(`      - Failure reason: ${result.getMessage()}`);
        if (result.getFailureType()) {
            this.logger.error(`      - Failure type: ${result.getFailureType()}`);
        }
        if (result.getActualValue()) {
            this.logger.error(`      - Actual value: ${result.getActualValue()}`);
        }
        if (result.getDataSetIdentifier()) {
            this.logger.error(`      - Data set number: ${result.getDataSetIdentifier()}`);
        }
        if (result.getMessageDetail()) {
            this.logger.error(`      - Failure detail: ${result.getMessageDetail()}`);
        }
    }

    private processLineTestIgnored(line: string, result?: TestResult): void {
        if (!result) {
            return;
        }

        // Get test details and failure message
        let testMessage = line.match(patternTestAttribMessage)?.at(1);
        let testMessageDetail = line.match(patternTestAttribDetails)?.at(1);
        
        // Update result item with reason why test was ignored
        result.markIgnored(testMessage, testMessageDetail);

        // Print details to log
        this.logger.info(`➖ IGNORED: ${result.getTestItem().id}`, false, {testItem: result.getTestItem()});
    }

    private processLineTestFinished(line: string, result?: TestResult): void {
        if (!result) {
            return;
        }

        // Get test details and duration
        let duration = 0;
        let testDuration = line.match(patternTestAttribDuration)?.at(1);
        if (testDuration) {
            duration = parseInt(testDuration);
            result.setDuration(duration);
        }

        // If the result is not failed or ignored, assume the test has completed successfully
        let status = result.getStatus();
        if (status !== TestResultStatus.failed && status !== TestResultStatus.ignored) {
            // Update result item as passed
            result.markPassed();

            // Print details to log
            this.logger.info(`✅ PASSED: ${result.getTestItem().id}`);
        }
        let testMessage = this.resultMap.addResult(result);

        // Update the test run with the aggregated messages and status for all executions of the test item.
        // Multiple executions will take place when a data provider has more than one set of data
        let testItem = result.getTestItem();
        let finalResult = this.resultMap.getTestStatus(testItem);
        switch (finalResult) {
            case TestResultStatus.failed:
            case TestResultStatus.error:
                this.run.failed(testItem, testMessage!, this.resultMap.getTestDuration(testItem));
                break;
            case TestResultStatus.ignored:
            case TestResultStatus.skipped:
                this.run.skipped(testItem);
                break;
            case TestResultStatus.passed:
                this.run.passed(testItem, this.resultMap.getTestDuration(testItem));
                break;
            default:
                // Not currently recording any other statuses
                break;
        }
    }

    private processLineTestSummaryOk(matches: RegExpMatchArray): void {
        this.resultMap.setNumTestResults(parseInt(matches.at(1)!));
        this.resultMap.setNumAssertions(parseInt(matches.at(3)!));
    }

    private processLineTestSummaryNotOk(line: string, matches: RegExpMatchArray): void {
        this.resultMap.setNumTestResults(parseInt(matches.at(2)!));
        this.resultMap.setNumAssertions(parseInt(matches.at(4)!));

        // Check for skipped tests
        let m: RegExpMatchArray | null;
        if (m = line.match(patternSummaryNotOkSkipped)) {
            this.resultMap.setNumSkipped(parseInt(m.at(1)!));
        }

        // Check for failed tests
        if (m = line.match(patternSummaryNotOkFailures)) {
            this.resultMap.setNumFailed(parseInt(m.at(1)!));
        }

        // Check for errored tests
        if (m = line.match(patternSummaryNotOkErrors)) {
            this.resultMap.setNumErrors(parseInt(m.at(1)!));
        }
    }
}