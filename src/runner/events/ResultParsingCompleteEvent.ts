import { TestRunResultMap } from "../TestRunResultMap";

export class ResultParsingCompleteEvent {
    constructor(
        public resultMap: TestRunResultMap
    ) {};
}