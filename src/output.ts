import * as vscode from 'vscode';
import { Settings } from './settings';

export enum LogLevel {
    trace = 0,
    info = 1,
    warn = 2,
    error = 3,
    none = 4
}

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private settings: Settings;

    constructor(settings: Settings) {
        // Create channel and set logging level based on settings
        this.settings = settings;
        this.outputChannel = vscode.window.createOutputChannel('PHPUnit Test Workbench');
    }

    public showOutputChannel() {
        this.outputChannel.show();
    }

    public hideOutputChannel() {
        this.outputChannel.hide();
    }

    public log(level: LogLevel, message: string) {
        if (level >= this.settings.get('log.level', LogLevel.info)) {
            this.outputChannel.appendLine(message);
        }
    }

    public trace(message: string) {
        this.log(LogLevel.trace, '[ TRACE ] ' + message);
    }

    public info(message: string) {
        this.log(LogLevel.info, '[ INFO  ] ' + message);
    }

    public warn(message: string) {
        this.log(LogLevel.warn, '[WARNING] ' + message);
    }

    public error(message: string) {
        this.log(LogLevel.error, '[ ERROR ] ' + message);
    }
}