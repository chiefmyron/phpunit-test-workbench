import * as vscode from 'vscode';
import { Logger } from "../../output";
import { Settings } from "../../settings";
import { AutoloaderDefinition } from './AutoloaderDefinition';

export class ComposerFileParser {
    private settings: Settings;
    private logger: Logger;

    constructor(
        settings: Settings,
        logger: Logger
    ) {
        this.settings = settings;
        this.logger = logger;

        this.logger.trace('Creating new ComposerFileParser instance...');
        this.logger.trace('ConfigFileParser instance created!');
    }

    public async parse(
        content: Buffer | string,
        file: vscode.Uri,
        workspaceFolder: vscode.WorkspaceFolder
    ): Promise<AutoloaderDefinition[]> {
        content = content.toString();
        let namespaceMap: AutoloaderDefinition[] = [];
        try {
            let composer = JSON.parse(content);
            if (composer['autoload'] && composer['autoload']['psr-4']) {
                let namespaces = this.parseNamespaceDefinitions(composer['autoload']['psr-4'], file, workspaceFolder);
                namespaceMap.push(...namespaces);
            }
            if (composer['autoload-dev'] && composer['autoload-dev']['psr-4']) {
                let namespaces = this.parseNamespaceDefinitions(composer['autoload-dev']['psr-4'], file, workspaceFolder);
                namespaceMap.push(...namespaces);
            }
            return namespaceMap;
        } catch (ex) {
            this.logParsingError(file, ex);
            return [];
        }
    }

    private parseNamespaceDefinitions(namespaces: any, file: vscode.Uri, workspaceFolder: vscode.WorkspaceFolder) {
        let results: AutoloaderDefinition[] = [];
        for (let name in namespaces) {
            let value = namespaces[name];

            let dirs = [];
            if (typeof value === 'string') {
                dirs.push(value);
            } else if (Array.isArray(value)) {
                dirs = value;
            }

            for (let dir of dirs) {
                let definition = new AutoloaderDefinition(
                    workspaceFolder,
                    name,
                    dir,
                    file
                );
                results.push(definition);
            }
        }
        return results;
    }

    private logParsingError(file: vscode.Uri, error: any) {
        this.logger.warn('Error while parsing composer.json file!');
        this.logger.warn(`Composer file file: ${file.fsPath}`);
        this.logger.warn(`Error message: ${error}`);
    }
}