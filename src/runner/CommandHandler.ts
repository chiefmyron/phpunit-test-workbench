import * as vscode from 'vscode';
import { Configuration } from "../config";
import { Logger } from "../output";
import { TestFileParser } from '../parser/TestFileParser';
import { TestRunner } from "./TestRunner";

export class CommandHandler {
    private ctrl: vscode.TestController;
    private parser: TestFileParser;
    private runner: TestRunner;
    private config: Configuration;
    private logger: Logger;

    constructor(
        ctrl: vscode.TestController,
        parser: TestFileParser,
        runner: TestRunner,
        config: Configuration,
        logger: Logger
    ) {
        this.ctrl = ctrl;
        this.parser = parser;
        this.runner = runner;
        this.config = config;
        this.logger = logger;
    }

    public async execute(command: string) {
        switch (command) {
            case 'run.method':

                break;
            case 'run.class':

                break;
            case 'run.suite':

                break;
            case 'run.all':
                // Ensure all test files have been parsed before starting the run
                await this.parser.discoverTestFilesInWorkspace();

                // Create test run request
                let request = new vscode.TestRunRequest();
                let cancellationTokenSource = new vscode.CancellationTokenSource();
                this.runner.run(request, cancellationTokenSource.token);
                break;
        }
    }
}