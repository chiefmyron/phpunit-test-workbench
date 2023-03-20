import * as vscode from 'vscode';
import { Parser } from "xml2js";
import { Logger } from "../../output";
import { Settings } from "../../settings";
import { TestSuite } from '../suites/TestSuite';

export class ConfigFileParser {
    private settings: Settings;
    private logger: Logger;
    private parser: Parser;

    constructor(
        settings: Settings,
        logger: Logger
    ) {
        this.settings = settings;
        this.logger = logger;

        this.logger.trace('Creating new ConfigFileParser instance...');
        this.parser = new Parser();
        this.logger.trace('ConfigFileParser instance created!');
    }

    public async parse(
        content: Buffer | string,
        file: vscode.Uri
    ): Promise<TestSuite[]> {
        content = content.toString();

        try {
            return await this.parser.parseStringPromise(content).then((result) => {
                return this.parseConfigObject(result, file);
            }).catch((err: any) => {
                this.logParsingError(file, err);
                return [];
            });
        } catch (ex) {
            this.logParsingError(file, ex);
            return [];
        }
    }

    private parseConfigObject(
        config: any,
        file: vscode.Uri
    ): TestSuite[] {
        // Check for the existence of test suite definitions
        if (!config.phpunit || !config.phpunit.testsuites || !config.phpunit.testsuites[0] || !config.phpunit.testsuites[0].testsuite) {
            return [];
        }

        let suites: TestSuite[] = [];
        for (let testsuite of config.phpunit.testsuites[0].testsuite) {
            // Get test suite details
            let suiteName = testsuite.$.name;

            // Create new test suite and add defined files or directories
            let suite = new TestSuite(file, suiteName);
            if (testsuite.directory) {
                for (let directory of testsuite.directory) {
                    if (typeof directory !== 'string' && directory._ && directory.$.suffix) {
                        suite.addDirectory(directory._, directory.$.suffix);
                    } else {
                        suite.addDirectory(directory);
                    }
                }
            }

            if (testsuite.file) {
                for (let file of testsuite.file) {
                    suite.addFile(file);
                }
            }

            suites.push(suite);
        }
        return suites;
    }

    private logParsingError(file: vscode.Uri, error: any) {
        this.logger.warn('Error while parsing configuration file XML!');
        this.logger.warn(`Configuration file: ${file.fsPath}`);
        this.logger.warn(`Error message: ${error}`);
    }
}