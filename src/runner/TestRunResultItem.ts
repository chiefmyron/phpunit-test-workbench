export enum TestRunResultStatus {
    unknown,
    passed,
    skipped,
    incomplete,
    failed,
    error,
    risky,
    warning,
    ignored
}

export class TestRunResultItem {
    private status: TestRunResultStatus;
    private testItemId: string;
    private message: string | undefined;
    private messageDetail: string | undefined;
    private messageLineItem: number | undefined;
    private testFailureType: string | undefined;
    private actualValue: string | undefined;
    private duration: number;

    constructor(testItemId: string) {
        this.testItemId = testItemId;
        this.status = TestRunResultStatus.unknown;
        this.duration = 0;
    }

    public getTestItemId(): string
    {
        return this.testItemId;
    }
    
    public getStatus(): TestRunResultStatus {
        return this.status;
    }

    public setStatus(status: TestRunResultStatus) {
        this.status = status;
    }

    public getMessage(): string {
        if (this.message) {
            return this.message;
        }
        return '';
    }

    public setMessage(message: string | undefined): void {
        // Parse message
        if (message) {
            // Replace linebreak characters
            message = message.replace(/\|n/g, " ");
        }
        this.message = message;
    }

    public getMessageDetail(): string {
        if (this.messageDetail) {
            return this.messageDetail;
        }
        return '';
    }

    public setMessageDetail(messageDetail: string| undefined): void {
        // Parse message detail
        if (messageDetail) {
            // Replace linebreak characters and remove trailing spaces or linebreaks
            messageDetail = messageDetail.trim();
            messageDetail = messageDetail.replace(/\|n$/, '');
            messageDetail = messageDetail.replace(/\|n/g, "\n");

            // Check for specific error location (line number)
            let messageDetailLines = messageDetail.split("\n"); 
            let messageLine = messageDetailLines.pop();
            if (messageLine && messageLine.indexOf(':') > 0) {
                let messageLineParts = messageLine.split(':');
                this.messageLineItem = Number(messageLineParts.pop());
            }
        }
        this.messageDetail = messageDetail;
    }

    public getMessageLineItem(): number {
        if (this.messageLineItem) {
            return this.messageLineItem;
        }
        return 0;
    }

    public getDuration(): number {
        return this.duration;
    }

    public setDuration(duration: number): void {
        this.duration = duration;
    }

    public getTestFailureType(): string {
        if (this.testFailureType) {
            return this.testFailureType;
        }
        return '';
    }

    public setTestFailureType(failureType: string | undefined): void {
        this.testFailureType = failureType;
    }

    public getActualValue(): string {
        if (this.actualValue) {
            return this.actualValue;
        }
        return '';
    }

    public setActualValue(value: string | undefined): void {
        if (value) {
            // Replace linebreak characters and remove trailing spaces or linebreaks
            value = value.trim();
            value = value.replace(/\|n$/, '');
            value = value.replace(/\|n/g, "\n");
        }

        this.actualValue = value;
    }
}