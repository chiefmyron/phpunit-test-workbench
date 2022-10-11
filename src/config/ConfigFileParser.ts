import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { TextDecoder } from 'util';
import { Settings } from '../settings';
import { Logger } from '../output';
import { TestSuiteMap } from '../suites/TestSuiteMap';
import { TestSuite } from '../suites/TestSuite';
import { TestFileParser } from '../parser/TestFileParser';

export class ConfigFileParser {
    private testFileParser: TestFileParser;
    private testSuiteMap: TestSuiteMap;
    private settings: Settings;
    private logger: Logger;
    private parser: xml2js.Parser;

    constructor(
        testFileParser: TestFileParser,
        testSuiteMap: TestSuiteMap,
        config: Settings,
        logger: Logger
    ) {
        this.testFileParser = testFileParser;
        this.testSuiteMap = testSuiteMap;
        this.settings = config;
        this.logger = logger;

        this.logger.trace('Creating new TestFileParser instance...');
        this.parser = new xml2js.Parser();
        this.logger.trace('TestFileParser instance created!');
    }

    private getPhpUnitConfigXmlLocatorPattern(workspaceFolder?: vscode.WorkspaceFolder) {
        return this.settings.get('phpunit.locatorPatternConfigXml', 'phpunit.xml', workspaceFolder);
    }

    public async refreshConfigFilesInWorkspace() {
        this.testSuiteMap.clear();
        return this.discoverConfigFilesInWorkspace();
    }

    public async discoverConfigFilesInWorkspace() {
        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
    
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                // Attempt to load a phpunit.xml configuration for the workspace
                const patternStringConfig = this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder);
                const patternConfig = new vscode.RelativePattern(workspaceFolder, patternStringConfig);
                for (const configFileUri of await vscode.workspace.findFiles(patternConfig)) {
                    await this.parseConfigFileContents(workspaceFolder, configFileUri);
                }
                
                // Set watcher for new, changed or deleted configuration files within the workspace
                const patternString = this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder);
                const pattern = new vscode.RelativePattern(workspaceFolder, patternString);
                const watcher = vscode.workspace.createFileSystemWatcher(pattern);

                // Re-parse config files on save
                vscode.workspace.onDidSaveTextDocument(document => {
                     if (vscode.languages.match({ pattern: pattern }, document) !== 0) {
                        this.testSuiteMap.deleteConfigFileTestSuites(document.uri);
                        this.parseConfigFileContents(workspaceFolder, document.uri, document.getText()).then(result => this.testFileParser.refreshTestFilesInWorkspace());
                    }
                });
    
                // Set file related event handlers
                watcher.onDidDelete(fileUri => this.testSuiteMap.deleteConfigFileTestSuites(fileUri));
    
                // Find initial set of configuration files for workspace
                for (const configFileUri of await vscode.workspace.findFiles(pattern)) {
                    await this.parseConfigFileContents(workspaceFolder, configFileUri);
                }
    
                return watcher;
            })
        );
    }

    public async parseOpenDocument(document: vscode.TextDocument) {
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return false;
        }

        // Check that this document matches the pattern defined for configuration XML files for the workspace
        const pattern = new vscode.RelativePattern(workspaceFolder, this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder));
        if (vscode.languages.match({ pattern: pattern }, document) !== 0) {
            return this.parseConfigFileContents(workspaceFolder, document.uri, document.getText());
        }
    }

    public async parseConfigFileContents(workspaceFolder: vscode.WorkspaceFolder, configFileUri: vscode.Uri, configFileContents?: string): Promise<boolean> {
        const workspaceFolderUri = workspaceFolder.uri;
        let result = false;
        
        // Check if we need to load file contents from disk
        this.logger.trace(`Parsing contents of file for configuration: ${configFileUri.toString()}`);
        if (!configFileContents) {
            this.logger.trace('Loading config file contents from disk...');
            try {
                const rawContent = await vscode.workspace.fs.readFile(configFileUri);
                configFileContents = new TextDecoder().decode(rawContent);
            } catch (e) {
                this.logger.warn('Unable to load config file content! Error message: ' + e);
                return false;
            }
        }

        // Parse file contents
        try {
            this.parser.parseStringPromise(configFileContents).then((result) => {
                if (result.phpunit && result.phpunit.testsuites && result.phpunit.testsuites[0] && result.phpunit.testsuites[0].testsuite) {
                    for (let testsuite of result.phpunit.testsuites[0].testsuite) {
                        // Get test suite details
                        let name = testsuite.$.name;
                        let directories: string[] = [];
                        if (testsuite.directory) {
                            for (let directory of testsuite.directory) {
                                directories.push(directory);
                            }
                        }

                        let files: string[] = [];
                        if (testsuite.file) {
                            for (let file of testsuite.file) {
                                files.push(file);
                            }
                        }

                        let suite = new TestSuite(workspaceFolderUri, configFileUri, name, directories, files);
                        this.testSuiteMap.set(suite);
                        result = true;
                    }
                }
                return result;
            })
            .catch((err) => {
                this.logger.warn('Error while parsing configuration file XML!');
                this.logger.warn(`Configuration file: ${configFileUri.fsPath}`);
                this.logger.warn(`Error message: ${err}`);
                return false;
            });
        } catch (e) {
            this.logger.warn('Error while parsing configuration file XML!');
            this.logger.warn(`Configuration file: ${configFileUri.fsPath}`);
            this.logger.warn(`Error message: ${e}`);
            return false;
        }

        return result;
    }
}
