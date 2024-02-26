import * as vscode from 'vscode';
import { Settings } from './settings';

export enum LogLevel {
    trace = 0,
    info = 1,
    warning = 2,
    error = 3,
    none = 4
}

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private settings: Settings;
    private testRun?: vscode.TestRun;

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

    public setTestRun(testRun: vscode.TestRun | undefined) {
        this.testRun = testRun;
    }

    public log(level: LogLevel, message: string, params?: LogMessageParams) {
        if (level >= this.settings.get('log.level', LogLevel.info)) {
            let prefix = '[' + LogLevel[level].toLocaleUpperCase() + ']';
            this.outputChannel.appendLine(prefix.padEnd(10) + message);

            // Parse log message parameters
            let testRun = this.testRun;
            let location = undefined;
            if (params) {
                // If a test run has been provided as a parameter, it takes precedence
                if (params.testRun) {
                    testRun = params.testRun;
                }

                // If a location has been provided as a parameter, it takes precedence
                if (params.location) {
                    location = params.location;
                } else if (params.testItem && params.testItem.uri && params.testItem.range) {
                    // Derive location from the test item
                    location = new vscode.Location(params.testItem.uri, params.testItem.range);
                }

            }

            // Log message to the test run output
            if (testRun && level > LogLevel.trace) {
                message = message.replace(/(?<![\r])\n/g, '\r\n');
                testRun.appendOutput(message + '\r\n', location, params?.testItem);
            }
        }
    }

    public trace(message: string, showDialog: boolean = false, params?: LogMessageParams) {
        this.log(LogLevel.trace, message, params);
        if (showDialog) {
            vscode.window.showInformationMessage(message);
        }
    }

    public info(message: string, showDialog: boolean = false, params?: LogMessageParams) {
        this.log(LogLevel.info, message, params);
        if (showDialog) {
            vscode.window.showInformationMessage(message);
        }
    }

    public warn(message: string, showDialog: boolean = false, params?: LogMessageParams) {
        this.log(LogLevel.warning, message, params);
        if (showDialog) {
            vscode.window.showWarningMessage(message);
        }
    }

    public error(message: string, showDialog: boolean = false, params?: LogMessageParams) {
        this.log(LogLevel.error, message, params);
        if (showDialog) {
            vscode.window.showErrorMessage(message);
        }
    }
}

export interface LogMessageParams {
    testRun?: vscode.TestRun;
    testItem?: vscode.TestItem;
    location?: vscode.Location;
}