import * as vscode from 'vscode';

export class DebugConfigQuickPickItem implements vscode.QuickPickItem {
    label: string;
    clientPort: number;
    clientHost: string;

    constructor(label: string, clientPort: number, clientHost: string) {
        this.label = label;
        this.clientPort = clientPort;
        this.clientHost = clientHost;
    }

    public getClientPort(): number {
        return this.clientPort;
    }

    public getClientHost(): string {
        return this.clientHost;
    }
}