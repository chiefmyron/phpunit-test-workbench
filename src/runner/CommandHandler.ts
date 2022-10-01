import * as vscode from 'vscode';
import { Configuration } from "../config";
import { Logger } from "../output";
import { TestFileParser } from '../parser/TestFileParser';
import { TestItemMap } from '../parser/TestItemMap';
import { TestRunner } from "./TestRunner";

export class CommandHandler {
    private ctrl: vscode.TestController;
    private parser: TestFileParser;
    private itemMap: TestItemMap;
    private runner: TestRunner;
    private config: Configuration;
    private logger: Logger;

    constructor(
        ctrl: vscode.TestController,
        parser: TestFileParser,
        itemMap: TestItemMap,
        runner: TestRunner,
        config: Configuration,
        logger: Logger
    ) {
        this.ctrl = ctrl;
        this.parser = parser;
        this.itemMap = itemMap;
        this.runner = runner;
        this.config = config;
        this.logger = logger;
    }

    public async execute(command: string) {
        let includes: vscode.TestItem[];
        let request: vscode.TestRunRequest;
        let cancellationTokenSource = new vscode.CancellationTokenSource();

        switch (command) {
            case 'run.method':

                break;
            case 'run.class':
                this.logger.info(`Running command: Run test class...`);

                // Identify the file open in the active editor
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    this.logger.warn(`No active editor found - cannot identify class to run!`);
                    return;
                }
                if (editor.document.languageId !== 'php') {
                    this.logger.warn(`This command can only be executed on a PHPUnit test class (*.php file). If you have a PHPUnit test class open, make sure it is the active editor by clicking in it and then try again.`);
                    return;
                }

                // Find test item definition for the document
                let testItem = this.itemMap.getTestItemForClass(editor.document.uri);
                if (!testItem) {
                    this.logger.warn(`No test item definition was found for the current class. Aborting test run.`);
                    return;
                }
                
                // Create test run request
                includes = [ testItem ];
                request = new vscode.TestRunRequest(includes);
                await this.runner.run(request, cancellationTokenSource.token);
                this.logger.info(`Command complete: Run test class`);
                break;
            case 'run.suite':

                break;
            case 'run.all':
                this.logger.info(`Running command: Run all tests...`);

                // Ensure all test files have been parsed before starting the run
                await this.parser.discoverTestFilesInWorkspace();

                // Create test run request
                request = new vscode.TestRunRequest();
                await this.runner.run(request, cancellationTokenSource.token);
                this.logger.info(`Command complete: Run all tests`);
                break;
        }
    }
}