import { TestRunResult } from "../TestRunResult";

export class ResultParsingCompleteEvent {
    constructor(
        public results: TestRunResult
    ) {};
}