import * as vscode from 'vscode';
import { Logger } from "../output";
import { generateTestItemId } from "../loader/tests/TestFileParser";
import { ItemType } from "../loader/tests/TestItemDefinition";
import { Settings } from '../settings';
import { TestResult, TestResultStatus } from './TestResult';
import { TestRunSummary } from './TestRunSummary';

const patternTestCount = new RegExp(/##teamcity\[testCount\b(?:(?=(\s+(?:count='([^']*)'|flowId='([^']*)')|[^\s>]+|\s+))\1)*/);
const patternTeamCityRecord = new RegExp(/##teamcity\[([a-zA-Z]+)|(\S+)=[']((?:\|.|[^\|'])*)[']/gm);
const patternSummaryOk = new RegExp(/OK \((\d*) (test|tests), (\d*) (assertion|assertions)\)/);
const patternSummaryNotOk = new RegExp(/(Tests|Assertions|Errors|Failures|Warnings|Skipped|Risky): ([0-9]*)+/gm);
const patternFatalError = new RegExp(/Fatal error: (.*)/);

export class TestRunResultParser extends vscode.EventEmitter<any> {

    private run: vscode.TestRun;
    private testItems: Map<string, vscode.TestItem>;
    private settings: Settings;
    private logger: Logger;

    private activeTestSuiteName: string = '';
    private activeTestSuiteUri: string = '';
    private activeTestSuiteClassname: string = '';
    private activeTestResult: TestResult | undefined;

    private summary: TestRunSummary;

    constructor(
        run: vscode.TestRun,
        testItems: Map<string, vscode.TestItem>,
        settings: Settings,
        logger: Logger
    ) {
        super();

        this.run = run;
        this.testItems = testItems;
        this.settings = settings;
        this.logger = logger;
        this.summary = new TestRunSummary();
    }

    public getSummary(): TestRunSummary {
        return this.summary;
    }

    public parseLine(line: string) {
        if (line === '') {
            return;
        }

        // Parse line
        this.logger.trace(line);
        let m: IterableIterator<RegExpMatchArray>;
        let n: RegExpMatchArray | null;

        // Check first of all for teamcity records in the log
        let recordType;
        let attributes = new Map<string, string>();
        m = line.matchAll(patternTeamCityRecord);
        for (let match of m) {
            if (match[0].startsWith('##teamcity')) {
                recordType = match.at(1)!;
            } else if (match.at(2) && match.at(3)) {
                attributes.set(match.at(2)!.trim(), match.at(3)!.trim());
            }
        }
        if (recordType) {
            switch (recordType) {
                case 'testSuiteStarted':
                    this.processLineTestSuiteStarted(attributes);
                    break;
                case 'testSuiteFinished':
                    this.processLineTestSuiteFinished(attributes);
                    break;
                case 'testStarted':
                    this.processLineTestStarted(attributes);
                    break;
                case 'testFailed':
                    this.processLineTestFailed(attributes);
                    break;
                case 'testFinished':
                    this.processLineTestFinished(attributes);
                    break;
                case 'testIgnored':
                    this.processLineTestIgnored(attributes);
                    break;
            }
        } else if (n = line.match(patternSummaryOk)) {
            this.processLineTestSummaryOk(n);
        } else if (n = line.match(patternSummaryNotOk)) {
            m = line.matchAll(patternSummaryNotOk);
            this.processLineTestSummaryNotOk(m);
        } else if (n = line.match(patternFatalError)) {
            this.processLineFatalError(n);
        }
    }

    private processLineTestSuiteStarted(attributes: Map<string, string>) {
        // Extract test suite details from the matched line
        let testSuiteName = attributes.get('name');
        let testSuiteLocation = this.parseLocationHintString(attributes.get('locationHint'));

        this.activeTestSuiteName = '';
        if (testSuiteName) {
            this.activeTestSuiteName = testSuiteName;
        }

        this.activeTestSuiteUri = '';
        if (testSuiteLocation.uri) {
            this.activeTestSuiteUri = testSuiteLocation.uri;
        }

        this.activeTestSuiteClassname = '';
        if (testSuiteLocation.classname) {
            this.activeTestSuiteClassname = testSuiteLocation.classname;
        }
    }

    private processLineTestSuiteFinished(attributes: Map<string, string>) {
        this.activeTestSuiteName = '';
        this.activeTestSuiteUri = '';
        this.activeTestSuiteClassname = '';
    }

    private processLineTestStarted(attributes: Map<string, string>) {
        // Extract test details from the matched line
        let name = attributes.get('name');
        let location = this.parseLocationHintString(attributes.get('locationHint'));
        if (!name || !location.uri) {
            this.logger.warn(`Unable to parse test location hint: ${attributes.get('locationHint')}`);
            return;
        }

        // Generate URI for the test file
        let uri = vscode.Uri.file(location.uri);
        let methodParts = this.parseTestNameString(location.method);

        // Locate TestItem for the test
        let id = generateTestItemId(ItemType.method, uri, methodParts.method);
        let testItem = this.testItems.get(id);
        if (!testItem) {
            this.logger.warn(`Unable to find test item for test: ${id}`);
            return;
        }

        // Create test result for the located test item
        this.activeTestResult = new TestResult(name, testItem);
        this.activeTestResult.markStarted();

        // Update the test run to indicate that the test item has started
        this.run.started(testItem);
        if (methodParts.dataSetId) {
            this.logger.trace(`Starting test execution for test: ${id} for data set ${methodParts.dataSetId}`);
        } else {
            this.logger.trace(`Starting test execution for test: ${id}`);
        }
        
    }

    private processLineTestFailed(attributes: Map<string, string>) {
        // Extract test details and error reasons from the matched line
        let name = attributes.get('name');
        let message = attributes.get('message');
        let details = attributes.get('details');
        let duration = attributes.get('duration');
        let type = attributes.get('type');
        let actualResult = attributes.get('actual');
        let expectedResult = attributes.get('expected');

        // Extract detail from the test name
        let nameParts = this.parseTestNameString(name);

        // Failed tests may sometimes not have a 'test started' message - these are recorded by
        // PHPUnit as errors (rather than failures). We need to start the test and then mark it as errored.
        if (!this.activeTestResult || this.activeTestResult.getName() !== name) {
            return this.processLineTestErrored(attributes);
            
        }
        
        // Validate that the matched line relates to the active test result
        if (this.activeTestResult.getName() !== name) {
            this.logger.warn(`Test result mismatch - test failure record is for test named '${name}' while currently active test result is named ${this.activeTestResult.getName()}`);
            return;
        }

        // Mark the test result as failed
        this.activeTestResult.markFailed(message, details, type, expectedResult, actualResult, nameParts.dataSetId);
        if (duration) {
            this.activeTestResult.setDuration(parseInt(duration));
        }

        // Update the test summary with the final result
        let outputMessage = this.summary.addTestResult(this.activeTestResult);
        this.run.failed(this.activeTestResult.getTestItem(), outputMessage!, this.activeTestResult.getDuration());
        
        // Print failure details to the log
        this.logger.error(`❌ FAILED: ${this.activeTestResult.getTestItem().id}`);
        this.logger.error(`      - Failure reason: ${this.activeTestResult.getMessage()}`);
        if (this.activeTestResult.getFailureType()) {
            this.logger.error(`      - Failure type: ${this.activeTestResult.getFailureType()}`);
        }
        if (this.activeTestResult.getActualValue()) {
            this.logger.error(`      - Actual value: ${this.activeTestResult.getActualValue()}`);
        }
        if (this.activeTestResult.getDataSetIdentifier()) {
            this.logger.error(`      - Data set number: ${this.activeTestResult.getDataSetIdentifier()}`);
        }
        if (this.activeTestResult.getMessageDetail()) {
            this.logger.error(`      - Failure detail: ${this.activeTestResult.getMessageDetail()}`);
        }

        // If setting is enabled, display the output window to show the test failure
        if (this.settings.get('log.autoDisplayOutput', 'errorsOnly') === 'testRunFailures') {
            this.logger.showOutputChannel();
        }
    }

    private processLineTestErrored(attributes: Map<string, string>) {
        // Extract test details and error reasons from the matched line
        let name = attributes.get('name');
        let message = attributes.get('message');
        let details = attributes.get('details');
        let duration = attributes.get('duration');
        let type = attributes.get('type');
        let actualResult = attributes.get('actual');
        let expectedResult = attributes.get('expected');

        // Locate TestItem for the test
        let nameParts = this.parseTestNameString(name);
        let uri = vscode.Uri.file(this.activeTestSuiteUri);
        let id = generateTestItemId(ItemType.method, uri, nameParts.method);
        let testItem = this.testItems.get(id);
        if (!testItem) {
            this.logger.warn(`Unable to find test item for test failing in error: ${id}`);
            return;
        }

        // Create test result for the located test item
        this.activeTestResult = new TestResult(name!, testItem);
        this.activeTestResult.markStarted();

        // Update the test run to indicate that the test item has started
        this.run.started(testItem);
        this.logger.trace(`Starting test execution for test: ${id}`);

        // Update the test summary with the final result
        this.activeTestResult.markErrored(message, details, type, expectedResult, actualResult, nameParts.dataSetId);
        let outputMessage = this.summary.addTestResult(this.activeTestResult);
        this.run.errored(this.activeTestResult.getTestItem(), outputMessage!, this.activeTestResult.getDuration());
        
        // Print failure details to the log
        this.logger.error(`❗ ERROR: ${this.activeTestResult.getTestItem().id}`);
        this.logger.error(`      - Failure reason: ${this.activeTestResult.getMessage()}`);
        if (this.activeTestResult.getFailureType()) {
            this.logger.error(`      - Failure type: ${this.activeTestResult.getFailureType()}`);
        }
        if (this.activeTestResult.getActualValue()) {
            this.logger.error(`      - Actual value: ${this.activeTestResult.getActualValue()}`);
        }
        if (this.activeTestResult.getDataSetIdentifier()) {
            this.logger.error(`      - Data set number: ${this.activeTestResult.getDataSetIdentifier()}`);
        }
        if (this.activeTestResult.getMessageDetail()) {
            this.logger.error(`      - Failure detail: ${this.activeTestResult.getMessageDetail()}`);
        }

        // If setting is enabled, display the output window to show the test failure
        if (this.settings.get('log.autoDisplayOutput', 'errorsOnly') === 'testRunFailures') {
            this.logger.showOutputChannel();
        }

        // Reset the current active test result to empty
        this.activeTestResult = undefined;
    }

    private processLineTestFinished(attributes: Map<string, string>) {
        // Extract test details from the matched line
        let name = attributes.get('name');
        let duration = attributes.get('duration');

        // If there is no active test result, then it has already been finalised (i.e. an error or ignore record without a preceding 'test started' message)
        if (!this.activeTestResult) {
            this.logger.trace(`Test result already finalised for test named '${name}'`);
            return;
        }

        // Ignored tests may sometimes not have a 'test started' message - in this case, we need to set a new active test result
        if (this.activeTestResult.getName() !== name) {
            this.logger.warn(`Test result mismatch - test finished record found for test named '${name}', which is different from the current active test named '${this.activeTestResult?.getName()}'`);
            return;
        }

        // Set or update test duration
        if (duration) {
            this.activeTestResult.setDuration(parseInt(duration));
        }

        // Get details of the active test result
        let testItem = this.activeTestResult.getTestItem();
        let currentStatus = this.activeTestResult.getStatus();
        let datasetIdentifier = this.activeTestResult.getDataSetIdentifier();

        // Set finalised test status and update the test run with the final result
        if (currentStatus === TestResultStatus.started || currentStatus === TestResultStatus.passed) {
            // Mark finished test as passed
            this.activeTestResult.markPassed();
            if (datasetIdentifier) {
                this.logger.info(`✅ PASSED: ${this.activeTestResult.getTestItem().id} for dataset ${datasetIdentifier}`);
            } else {
                this.logger.info(`✅ PASSED: ${this.activeTestResult.getTestItem().id}`);
            }

            this.summary.addTestResult(this.activeTestResult);
            this.run.passed(testItem, this.activeTestResult.getDuration());
        }

        // Reset the current active test result to empty
        this.activeTestResult = undefined;
    }

    private processLineTestIgnored(attributes: Map<string, string>) {
        // Extract test details and error reasons from the matched line
        let name = attributes.get('name');
        let message = attributes.get('message');
        let duration = attributes.get('duration');

        // Ignored tests may sometimes not have a 'test started' message - in this case, we need to set a new active test result
        if (!this.activeTestResult || this.activeTestResult.getName() !== name) {
            // Locate TestItem for the test
            let nameParts = this.parseTestNameString(name);
            let uri = vscode.Uri.file(this.activeTestSuiteUri);
            let id = generateTestItemId(ItemType.method, uri, nameParts.method);
            let testItem = this.testItems.get(id);
            if (!testItem) {
                this.logger.warn(`Unable to find test item for ignored test: ${id}`);
                return;
            }

            // Create test result for the located test item
            this.activeTestResult = new TestResult(name!, testItem);
            this.activeTestResult.markStarted();

            // Update the test run to indicate that the test item has started
            this.run.started(testItem);
            this.logger.trace(`Starting test execution for test: ${id}`);
        }

        // Mark test result as ignored, and include reason message
        this.activeTestResult.markIgnored(message);

        // Update the test summary with the final result
        let outputMessage = this.summary.addTestResult(this.activeTestResult);
        this.run.skipped(this.activeTestResult.getTestItem());

        // Print ignored test details to the log
        this.logger.info(`➖ IGNORED: ${this.activeTestResult.getTestItem().id}`, false, {testItem: this.activeTestResult.getTestItem()});

        // Reset the current active test result to empty
        this.activeTestResult = undefined;
    }

    private processLineTestSummaryOk(matches: RegExpMatchArray) {
        // Extract test summary values from the matched line
        let tests = parseInt(matches.at(1)!);
        let assertions = parseInt(matches.at(3)!);

        // Set reported summary values
        this.summary.setReportedSummaryCounts(tests, assertions, 0, 0, 0, 0, 0);
    }

    private processLineTestSummaryNotOk(matches: IterableIterator<RegExpMatchArray>) {
        // Extract test summary values from the matched line
        let tests = 0;
        let assertions = 0;
        let failures = 0;
        let warnings = 0;
        let skipped = 0;
        let errors = 0;
        let risky = 0;
        for (let match of matches) {
            if (match.at(1) === 'Tests' && match.at(2)) {
                tests = parseInt(match.at(2)!);
            } else if (match.at(1) === 'Assertions' && match.at(2)) {
                assertions = parseInt(match.at(2)!);
            } else if (match.at(1) === 'Failures' && match.at(2)) {
                failures = parseInt(match.at(2)!);
            } else if (match.at(1) === 'Warnings' && match.at(2)) {
                warnings = parseInt(match.at(2)!);
            } else if (match.at(1) === 'Skipped' && match.at(2)) {
                skipped = parseInt(match.at(2)!);
            } else if (match.at(1) === 'Errors' && match.at(2)) {
                errors = parseInt(match.at(2)!);
            } else if (match.at(1) === 'Risky' && match.at(2)) {
                risky = parseInt(match.at(2)!);
            }
        }
        this.summary.setReportedSummaryCounts(tests, assertions, failures, warnings, skipped, errors, risky);
    }

    private processLineFatalError(matches: RegExpMatchArray) {
        // Extract error message from matched line
        let message = matches.at(1)!;

        // Log error message directly and pop error message to the user
        this.logger.error(`Fatal error occurred while running tests: ${message}\n`);
        vscode.window.showErrorMessage('Fatal error occurred while executing PHPUnit test run', { detail: message, modal: false }, 'View output').then(item => {
            if (item === 'View output') {
                this.logger.showOutputChannel();
            }
        });
    }

    private parseLocationHintString(locationHint?: string): {uri?: string, classname?: string, method?: string} {
        if (!locationHint) {
            return {uri: undefined, classname: undefined, method: undefined};
        }
        let parts = locationHint.split('::');
        let uri = parts.at(0)?.replace('php_qn://', '');

        return {
            uri: uri,
            classname: parts.at(1),
            method: parts.at(2)
        };
    }

    private parseTestNameString(name?: string): {method?: string, dataSetId?: string} {
        if (!name) {
            return {method: undefined, dataSetId: undefined};
        }

        let method = name;
        let dataSetId = undefined;
        if (name.includes('with data set')) {
            let parts = name.split('with data set');
            method = parts.at(0)!.trim();
            dataSetId = parts.at(1)?.trim();
        }

        return {
            method: method,
            dataSetId: dataSetId
        };
    }

    private parseDurationString(duration?: string): number {
        if (!duration) {
            return 0;
        }

        let value = 0;
        try {
            value = parseInt(duration);
        } catch (e) { }
        return value;
    }
}