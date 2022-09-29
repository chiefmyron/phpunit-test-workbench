import * as vscode from 'vscode';

export enum LogLevel {
    trace = 0,
    info = 1,
    warn = 2,
    error = 3,
    none = 4
}

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private level: number;

    constructor() {
        // Create channel and set logging level based on settings
        const settings = vscode.workspace.getConfiguration('phpunit-test-workbench.log');
        this.outputChannel = vscode.window.createOutputChannel('PHPUnit Test Workbench');
        this.level = settings.get('level', LogLevel.info);
    }

    public showOutputChannel() {
        this.outputChannel.show();
    }

    public hideOutputChannel() {
        this.outputChannel.hide();
    }

    public log(level: LogLevel, message: string) {
        if (level >= this.level) {
            this.outputChannel.appendLine(message);
        }
    }

    public trace(message: string) {
        this.log(LogLevel.trace, '[TRACE]   ' + message);
    }

    public info(message: string) {
        this.log(LogLevel.info, '[INFO]    ' + message);
    }

    public warn(message: string) {
        this.log(LogLevel.warn, '[WARNING] ' + message);
    }

    public error(message: string) {
        this.log(LogLevel.error, '[ERROR]   ' + message);
    }
}