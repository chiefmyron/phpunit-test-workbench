import * as vscode from 'vscode';
import { Logger } from "../output";
import { TestRunResult } from "./TestRunResult";
import { TestRunResultItem, TestRunResultStatus } from "./TestRunResultItem";
import { generateTestItemId } from "../loader/tests/TestFileParser";
import { ItemType } from "../loader/tests/TestItemDefinition";
import { ResultParsingCompleteEvent } from './events/ResultParsingCompleteEvent';
import { Settings } from '../settings';

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
    private result: TestRunResultItem | undefined;
    private results: TestRunResult;
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
        this.results = new TestRunResult();
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
            new ResultParsingCompleteEvent(this.results)
        );
    }

    public reset(): void {
        this.results.reset();
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

    public getResults(): TestRunResult {
        return this.results;
    }

    private processLineTestStarted(line: string): TestRunResultItem | undefined {
        // Get test details
        let testName = line.match(patternTestAttribName)?.at(1);
        let testLocationHint = line.match(patternTestAttribLocationHint)?.at(1);

        // Parse location hint to build up ID for test item
        let testLocationHintParts = testLocationHint?.split('::');
        let testRunResultItem: TestRunResultItem | undefined;
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
                testRunResultItem = new TestRunResultItem(testItem);
                testRunResultItem.setStarted();

                // Update the test run to indicate the test has started
                this.run.started(testItem);
            } else {
                this.logger.warn('Unable to find test item for test: ' + testId);
            }
        } else {
            this.logger.warn('Unable to parse test location hint: ' + testLocationHint);
        }
        return testRunResultItem;
    }

    private processLineTestFailed(line: string, result?: TestRunResultItem): void {
        // Get test details and failure message
        let testMessage = line.match(patternTestAttribMessage)?.at(1);
        let testMessageDetail = line.match(patternTestAttribDetails)?.at(1);
        let testFailureType = line.match(patternTestAttribType)?.at(1);
        let testActualValue = line.match(patternTestAttribActual)?.at(1);

        // Update result item with failure details
        if (result) {
            result.setFailed(testMessage, testMessageDetail, testFailureType, testActualValue);
        }
    }

    private processLineTestIgnored(line: string, result?: TestRunResultItem): void {
        // Get test details and failure message
        let testMessage = line.match(patternTestAttribMessage)?.at(1);
        let testMessageDetail = line.match(patternTestAttribDetails)?.at(1);
        
        // Update result item with reason why test was ignored
        if (result) {
            result.setIgnored(testMessage, testMessageDetail);
        }
    }

    private processLineTestFinished(line: string, result?: TestRunResultItem): void {
        // Get test details and duration
        let duration = 0;
        let testDuration = line.match(patternTestAttribDuration)?.at(1);
        if (testDuration) {
            duration = parseInt(testDuration);
        }

        // Record final result of the test
        if (result) {
            let testItem = result.getTestItem();
            result.setDuration(duration);

            if (result.getStatus() === TestRunResultStatus.failed) {
                // Check settings to see whether we need to display the output window
                if (this.settings.get('log.autoDisplayOutput', 'testRunFailures') === 'testRunFailures') {
                    this.logger.showOutputChannel();
                }

                // Update the test run to mark the test as failed
                this.run.failed(testItem, result.getTestMessage(), duration);

                // Print details to log
                this.logger.error(`❌ FAILED: ${testItem.id}`);
                this.logger.error(`      - Failure reason: ${result.getMessage()}`);
                if (result.getTestFailureType().length > 0) {
                    this.logger.error(`      - Failure type: ${result.getTestFailureType()}`);
                }
                if (result.getActualValue().length > 0) {
                    this.logger.error(`      - Actual value: ${result.getActualValue()}`);
                }
                if (result.getMessageDetail().length > 0) {
                    this.logger.error(`      - Failure detail: ${result.getMessageDetail()}`);
                }
            } else if (result.getStatus() === TestRunResultStatus.ignored) {
                // Update the test run to mark the test as ignored / skipped
                this.run.skipped(testItem);

                // Print details to log
                this.logger.info(`➖ IGNORED: ${testItem.id}`, false, {testItem: testItem});
            } else if (result.getStatus() === TestRunResultStatus.started || result.getStatus() === TestRunResultStatus.passed) {
                // Ensure result is marked as passed
                result.setPassed();
                
                // Update the test run to mark the test as passed
                this.run.passed(testItem, duration);

                // Print details to log
                this.logger.info(`✅ PASSED: ${testItem.id}`);
            }
            
            // Add result to array for inclusion in summary
            this.results.addTestRunResultItem(result);
        }
    }

    private processLineTestSummaryOk(matches: RegExpMatchArray): void {
        this.results.setNumTests(parseInt(matches.at(1)!));
        this.results.setNumAssertions(parseInt(matches.at(3)!));
    }

    private processLineTestSummaryNotOk(line: string, matches: RegExpMatchArray): void {
        this.results.setNumTests(parseInt(matches.at(2)!));
        this.results.setNumAssertions(parseInt(matches.at(4)!));

        // Check for skipped tests
        let m: RegExpMatchArray | null;
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
    }
}