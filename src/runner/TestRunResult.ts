import { TestRunResultItem } from "./TestRunResultItem";

export class TestRunResult {
    private items: TestRunResultItem[] = [];
    private numTests: number = 0;
    private numAssertions: number = 0;
    private numSkipped: number = 0;
    private numFailed: number = 0;
    private numErrors: number = 0;

    public addTestRunResultItem(item: TestRunResultItem) {
        this.items.push(item);
    }

    public getTestRunResultItems(): TestRunResultItem[] {
        return this.items;
    }

    public setNumTests(count: number) {
        this.numTests = count;
    }

    public setNumAssertions(count: number) {
        this.numAssertions = count;
    }

    public setNumSkipped(count: number) {
        this.numSkipped = count;
    }

    public setNumFailed(count: number) {
        this.numFailed = count;
    }

    public setNumErrors(count: number) {
        this.numErrors = count;
    }

    public getNumTests() {
        return this.numTests;
    }

    public getNumAssertions() {
        return this.numAssertions;
    }

    public getNumSkipped() {
        return this.numSkipped;
    }

    public getNumFailed() {
        return this.numFailed;
    }

    public getNumErrors() {
        return this.numErrors;
    }

    public reset() {
        this.items = [];
        this.numTests = 0;
        this.numAssertions = 0;
        this.numSkipped = 0;
        this.numFailed = 0;
        this.numErrors = 0;
    }

    public append(result: TestRunResult) {
        this.items = this.items.concat(result.getTestRunResultItems());
        this.numTests = this.numTests + result.getNumTests();
        this.numAssertions = this.numAssertions + result.getNumAssertions();
        this.numSkipped = this.numSkipped + result.getNumSkipped();
        this.numFailed = this.numFailed + result.getNumFailed();
        this.numErrors = this.numErrors + result.getNumErrors();
    }

    public getTestRunSummary(): string {
        let output = `Test run completed: ${this.numTests} tests, ${this.numAssertions} assertions`;

        if (this.numSkipped > 0) {
            output = output + `, ${this.numSkipped} skipped`;
        }
        if (this.numFailed > 0) {
            output = output + `, ${this.numFailed} failed`;
        }
        if (this.numErrors > 0) {
            output = output + `, ${this.numErrors} errored`;
        }
        return output;
    }
}