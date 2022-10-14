import * as vscode from 'vscode';

export class TestItemQuickPickItem implements vscode.QuickPickItem {
    label: string;
    detail: string;
    id: string;

    constructor(id: string, label: string, detail: string) {
        this.id = id;
        this.label = label;
        this.detail = `Test suite defined in: ${detail}`;
    }

    public getId(): string {
        return this.id;
    }
}