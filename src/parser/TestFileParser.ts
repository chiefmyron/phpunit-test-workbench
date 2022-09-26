/* eslint-disable @typescript-eslint/naming-convention */
/// <reference path="../../types/php-parser.d.ts" />
import Engine from 'php-parser';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { ItemType, TestItemDefinition } from './TestItemDefinition';

export const testDataMap = new WeakMap<vscode.TestItem, TestItemDefinition>();

export function getTestItemDefinition(item: vscode.TestItem): TestItemDefinition | undefined {
    return testDataMap.get(item);
}

export class TestFileParser {
    public ctrl: vscode.TestController;
    private optTestOrganisationMode: string = 'file';
    private parser: Engine;

    constructor(ctrl: vscode.TestController) {
        this.ctrl = ctrl;
        this.parser = Engine.create({
            ast: {
                withPositions: true,
                withSource: true
            },
            parser: {
                php7: true,
                debug: false,
                extractDoc: true,
                suppressErrors: true
            },
            lexer: {
                all_tokens: true,
                comment_tokens: true,
                mode_eval: true,
                asp_tags: true,
                short_tags: true
            }
        });
    }

    public setTestOrganisationMode(mode: string) {
        this.optTestOrganisationMode = mode;
    }

    public clearTestControllerItems() {
        this.ctrl.items.forEach(item => this.ctrl.items.delete(item.id));
    }

    public async parseTestFileContents(workspaceFolderUri: vscode.Uri, testFileUri: vscode.Uri, testFileContents?: string) {
        // Only need to parse PHP files
        if (testFileUri.scheme !== 'file' || !testFileUri.path.endsWith('.php')) {
            return;
        }
        
        // Check if we need to load file contents from disk
        if (!testFileContents) {
            console.info(`Loading contents of '${testFileUri.fsPath}' from disk...`);
            try {
                const rawContent = await vscode.workspace.fs.readFile(testFileUri);
                testFileContents = new TextDecoder().decode(rawContent);
            } catch (e) {
                console.warn('Unable to load test file contents!', e);
                return;
            }
        }
        
        // Parse test file contents
        const tree: any = this.parser.parseCode(testFileContents);
    
        // Get the namespace for the test file
        const namespaceNode = this.findNamespaceNode(tree.children);
        if (!namespaceNode) {
            console.warn(`Unable to find namespace definition in test file: ${testFileUri.toString()}`);
        }
    
        // Get classes for the test file
        const namespaceChildNodes = namespaceNode ? namespaceNode.children : tree;
        const classNode = this.findClassNode(namespaceChildNodes);
        if (!classNode) {
            console.error(`Unable to find class definition in test file: ${testFileUri.toString()}`);
            return;
        }
    
        // Get test methods for class
        const methodNodes = this.findTestMethodNodes(classNode.body);
    
        // Check if the TestItem for the test file has already been created
        let classTestItem: any;
        if (this.optTestOrganisationMode === 'namespace') {
            // Verify or create hierarchy of namespace TestItems as parent nodes before creating the class test item
            let namespaceTestItem = this.createNamespaceTestItems(namespaceNode, this.ctrl, workspaceFolderUri, testFileUri);
            classTestItem = this.createClassTestItem(classNode, this.ctrl, workspaceFolderUri, testFileUri, namespaceTestItem);
        } else if (this.optTestOrganisationMode === 'testsuite') {
    
        } else {
            // Create class test item as a root node
            classTestItem = this.createClassTestItem(classNode, this.ctrl, workspaceFolderUri, testFileUri);
        }
    
        // For each method, create child TestItem
        methodNodes.map((methodNode: any) => {
            // Create TestItem for method
            const methodName = methodNode.name.name;
            const methodId = `${classTestItem!.id}::${methodName}`;
            const methodTestItem = this.ctrl.createTestItem(methodId, methodName, testFileUri);
            methodTestItem.range = new vscode.Range(
                new vscode.Position(methodNode.loc.start.line, methodNode.loc.start.column),
                new vscode.Position(methodNode.loc.end.line, methodNode.loc.end.column)
            );
    
            // Add as a child of the class TestItem
            classTestItem!.children.add(methodTestItem);

            // Build PHPUnit Id as the fully qualified class name, plus method name
            let methodPhpUnitId = testDataMap.get(classTestItem)!.getPhpUnitId();
            methodPhpUnitId = methodPhpUnitId + '::' + methodName;

            const methodTestItemDef = new TestItemDefinition(ItemType.method, workspaceFolderUri, methodPhpUnitId);
            testDataMap.set(methodTestItem, methodTestItemDef);
        });
    }
    
    private findNamespaceNode(nodes: any[]): any {
        for (const node of nodes) {
            if (node.kind === 'namespace') {
                return node;
            }
        }
        return;
    }
    
    private findClassNode(nodes: any[]): any {
        for (const node of nodes) {
            if (node.kind === 'class' && !node.isAbstract) {
                return node;
            }
        }
        return;
    }
        
    private findTestMethodNodes(nodes: any[]): any[] {
        return nodes.reduce((methods: any[], node: any) => {
            if (node.kind === 'method' && node.visibility === 'public' && node.name.name.startsWith('test')) {
                return methods.concat(node);
            }
    
            return methods;
        }, []);
    }
    
    private createNamespaceTestItems(namespaceNode: any, ctrl: vscode.TestController, workspaceFolderUri: vscode.Uri, namespaceFolderUri: vscode.Uri): vscode.TestItem {
        // Determine the base path for the test file
        const namespace = namespaceNode.name;
        const namespaceParts = namespace.split('\\');
        const filePathParts = namespaceFolderUri.path.split('/');
        const workspacePathParts = workspaceFolderUri.path.split('/');
    
        let workspaceRootFound = false;
        let basePathParts: string[] = [];
        for (const part of filePathParts) {
            basePathParts.push(part);

            if (workspaceRootFound === false && part === workspacePathParts[0]) {
                workspacePathParts.shift();
                if (workspacePathParts.length > 0) {
                    continue;
                }
            }

            if (part === namespaceParts[0]) {
                basePathParts.pop();
                break;
            }
            
        }
        const basePath = basePathParts.join('/');
    
        return this.traverseNamespaceHierarchy(ctrl, workspaceFolderUri, basePath, namespaceParts);
    }
    
    private traverseNamespaceHierarchy(ctrl: vscode.TestController, workspaceFolderUri: vscode.Uri, basePath: string, namespaceParts: string[], parentTestItem?: vscode.TestItem): vscode.TestItem {
        // Construct identifier for the namespace
        let namespaceLabel = namespaceParts.shift();
        let namespacePath = '';
        if (parentTestItem) {
            namespacePath = parentTestItem.id + '/' + namespaceLabel;
        } else {
            namespacePath = basePath + '/' + namespaceLabel;
        }
        let namespaceUri = vscode.Uri.parse(namespacePath);
        let namespaceId = namespaceUri.toString();
    
        // Check if this already exists as a child of the parent item
        let namespaceTestItem = undefined;
        if (parentTestItem) {
            namespaceTestItem = parentTestItem.children.get(namespaceId);
        } else {
            namespaceTestItem = ctrl.items.get(namespaceId);
        }
    
        // If the namespace does not already exist, create it now
        if (!namespaceTestItem) {
            // Create new TestItem for namespace component
            namespaceTestItem = ctrl.createTestItem(namespaceId, namespaceLabel!, namespaceUri);
            namespaceTestItem.canResolveChildren = true;
    
            // Add new namespace TestItem as a child in the hierarchy
            let namespacePhpUnitId = namespaceLabel;
            if (parentTestItem) {
                parentTestItem.children.add(namespaceTestItem);

                // Rebuild namespace from label and parent test item, and use as the PHPUnit ID for the item
                namespacePhpUnitId = testDataMap.get(parentTestItem)!.getPhpUnitId();
                namespacePhpUnitId = namespacePhpUnitId + '\\' + namespaceLabel;
            } else {
                ctrl.items.add(namespaceTestItem);
            }
            const namespaceTestItemDef = new TestItemDefinition(ItemType.folder, workspaceFolderUri, namespacePhpUnitId);
            testDataMap.set(namespaceTestItem, namespaceTestItemDef);
        }
    
        // If there are still additional namespace components, continue recursion
        if (namespaceParts.length > 0) {
            return this.traverseNamespaceHierarchy(ctrl, workspaceFolderUri, basePath, namespaceParts, namespaceTestItem);
        }
    
        // No additional components - this is the end of the recursion
        return namespaceTestItem;
    }
    
    private createClassTestItem(classNode: any, ctrl: vscode.TestController, workspaceFolderUri: vscode.Uri, testFileUri: vscode.Uri, parentTestItem?: vscode.TestItem): vscode.TestItem {
        let classId = testFileUri.toString();
        let classLabel = classNode.name.name;
        
        // Check if this already exists as a child of the parent item
        let classTestItem = undefined;
        if (parentTestItem) {
            classTestItem = parentTestItem.children.get(classId);
        } else {
            classTestItem = ctrl.items.get(classId);
        }
    
        // If the class does not already exist, create it now
        if (!classTestItem) {
            // Create nes TestItem for class
            classTestItem = ctrl.createTestItem(classId, classLabel, testFileUri);
            classTestItem.range = new vscode.Range(
                new vscode.Position(classNode.loc.start.line, classNode.loc.start.column),
                new vscode.Position(classNode.loc.end.line, classNode.loc.end.column)
            );
            classTestItem.canResolveChildren = true;
        
            // Add new class TestItem as a child in the hierarchy
            let classPhpUnitId = classLabel;
            if (parentTestItem) {
                parentTestItem.children.add(classTestItem);

                // Build fully-qualified class name from label and parent namespace test item, and use as the PHPUnit ID for the item
                classPhpUnitId = testDataMap.get(parentTestItem)!.getPhpUnitId();
                classPhpUnitId = classPhpUnitId + '\\' + classLabel;
            } else {
                ctrl.items.add(classTestItem);
            }
            const classTestItemDef = new TestItemDefinition(ItemType.class, workspaceFolderUri, classPhpUnitId);
            testDataMap.set(classTestItem, classTestItemDef);
        }
        
        return classTestItem;
    }
}
