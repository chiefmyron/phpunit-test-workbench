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
        this.message = message;
    }

    public getMessageDetail(): string {
        if (this.messageDetail) {
            return this.messageDetail;
        }
        return '';
    }

    public setMessageDetail(messageDetail: string| undefined): void {
        this.messageDetail = messageDetail;
    }

    public getDuration(): number {
        return this.duration;
    }

    public setDuration(duration: number): void {
        this.duration = duration;
    }
}