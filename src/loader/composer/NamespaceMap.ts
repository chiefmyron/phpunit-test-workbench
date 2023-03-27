import * as vscode from 'vscode';
import { AutoloaderDefinition } from './AutoloaderDefinition';

export class NamespaceMap {
    private namespaceMap: Map<string, AutoloaderDefinition>;

    constructor() {
        this.namespaceMap = new Map<string, AutoloaderDefinition>();
    }

    public getWorkspaceNamespaceMap(workspaceFolder: vscode.WorkspaceFolder): AutoloaderDefinition[] {
        const namespaces: AutoloaderDefinition[] = [];
        this.namespaceMap.forEach((definition, key) => {
            if (key.startsWith(workspaceFolder.uri.toString())) {
                namespaces.push(definition);
            }
        });
        return namespaces;
    }

    public add(workspaceFolder: vscode.WorkspaceFolder, definitions: AutoloaderDefinition[]) {
        for (let definition of definitions) {
            this.set(workspaceFolder, definition);
        }
    }

    public set(workspaceFolder: vscode.WorkspaceFolder, definition: AutoloaderDefinition) {
        let id = workspaceFolder.uri.toString() + '||' + definition.getNamespace() + '||' + definition.getDirectory();
        this.namespaceMap.set(id, definition);
    }

    public has(workspaceFolder: vscode.WorkspaceFolder, namespace: string): boolean {
        let id = workspaceFolder.uri.toString() + '||' + namespace;
        this.namespaceMap.forEach((definition, key) => {
            if (key.startsWith(id)) {
                return true;
            }
        });
        return false;
    }

    public delete(workspaceFolder: vscode.WorkspaceFolder, namespace: string) {
        let id = workspaceFolder.uri.toString() + '||' + namespace;
        this.namespaceMap.forEach((definition, key) => {
            if (key.startsWith(id)) {
                this.namespaceMap.delete(key);
            }
        });
    }

    public deleteComposerFileNamespaces(composerFileUri: vscode.Uri) {
        this.namespaceMap.forEach((definition, key) => {
            if (definition.getComposerFileUri() === composerFileUri) {
                this.namespaceMap.delete(key);
            }
        });
    }

    public clear() {
        this.namespaceMap.clear();
    }
}


