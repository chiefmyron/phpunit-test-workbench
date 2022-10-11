import * as vscode from 'vscode';

export class Settings {
    private settings: Map<string, vscode.WorkspaceConfiguration>;

    constructor() {
        this.settings = new Map<string, vscode.WorkspaceConfiguration>();
    }

    public get(section: string, defaultValue?: any, scope?: vscode.ConfigurationScope) {
        // If scope has not been supplied, assume default scope
        let scopeId = '__DEFAULT__';
        if (scope) {
            scopeId = scope.toString();
        }

        // Check if settings have already been loaded for the scope
        if (this.settings.has(scopeId) !== true) {
            this.settings.set(scopeId, vscode.workspace.getConfiguration('phpunit-test-workbench', scope));
        }

        let settings = this.settings.get(scopeId)!;
        return settings.get(section, defaultValue);
    }

    public refresh() {
        this.settings.clear();
    }
}