import { TestRunResultItem, TestRunResultStatus } from "./TestRunResultItem";
import * as vscode from 'vscode';

const patternTestStarted = new RegExp(/##teamcity\[testStarted name='(.*)' locationHint='php_qn:\/\/(.*)' flowId='(.*)']/);
const patternTestFailed = new RegExp(/##teamcity\[testFailed name='(.*)' message='(.*)' details='(.*)' duration='(\d*)' flowId='(.*)']/);
const patternTestIgnored = new RegExp(/##teamcity\[testIgnored name='(.*)' message='(.*)' details='(.*)' duration='(\d*)' flowId='(.*)']/);
const patternTestFinished = new RegExp(/##teamcity\[testFinished name='(.*)' duration='(\d*)' flowId='(.*)']/);

export class TestRunResultParser {
    private results: TestRunResultItem[] = [];

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
        }

        return this.results;
    }
}