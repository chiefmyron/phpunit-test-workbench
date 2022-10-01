/* eslint-disable @typescript-eslint/naming-convention */
/// <reference path="../../types/php-parser.d.ts" />
import Engine from 'php-parser';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { Configuration } from '../config';
import { Logger } from '../output';
import { ItemType, TestItemDefinition } from './TestItemDefinition';
import { TestItemMap } from './TestItemMap';

export class TestFileParser {
    private ctrl: vscode.TestController;
    private itemMap: TestItemMap;
    private config: Configuration;
    private parser: Engine;
    private logger: Logger;

    constructor(
        ctrl: vscode.TestController,
        itemMap: TestItemMap,
        config: Configuration,
        logger: Logger
    ) {
        this.ctrl = ctrl;
        this.itemMap = itemMap;
        this.config = config;
        this.logger = logger;

        this.logger.trace('Creating new TestFileParser instance...');
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
        this.logger.trace('TestFileParser instance created!');
    }

    public clearTestControllerItems() {
        this.ctrl.items.forEach(item => this.ctrl.items.delete(item.id));
        this.itemMap.clear();
    }

    public removeTestFile(testItemId: string) {
        this.ctrl.items.delete(testItemId);
        this.itemMap.delete(testItemId);
    }

    public async discoverTestFilesInWorkspace() {
        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
    
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                const patternString = this.config.get('locatorPatternTests', '{test,tests,Test,Tests}/**/*Test.php', workspaceFolder);
                const pattern = new vscode.RelativePattern(workspaceFolder, patternString);
                const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    
                // Set file related event handlers
                watcher.onDidCreate(fileUri => this.parseTestFileContents(workspaceFolder.uri, fileUri));
                watcher.onDidChange(fileUri => this.parseTestFileContents(workspaceFolder.uri, fileUri));
                watcher.onDidDelete(fileUri => this.removeTestFile(fileUri.toString()));
    
                // Find initial set of files for workspace
                for (const fileUri of await vscode.workspace.findFiles(pattern)) {
                    await this.parseTestFileContents(workspaceFolder.uri, fileUri);
                }
    
                return watcher;
            })
        );
    }

    public async parseTestFileContents(workspaceFolderUri: vscode.Uri, testFileUri: vscode.Uri, testFileContents?: string) {
        // Only need to parse PHP files
        if (testFileUri.scheme !== 'file' || !testFileUri.path.endsWith('.php')) {
            return;
        }
        
        // Check if we need to load file contents from disk
        this.logger.trace(`Parsing contents of file for test cases: ${testFileUri.toString()}`);
        if (!testFileContents) {
            this.logger.trace('Loading test file contents from disk...');
            try {
                const rawContent = await vscode.workspace.fs.readFile(testFileUri);
                testFileContents = new TextDecoder().decode(rawContent);
            } catch (e) {
                this.logger.warn('Unable to load test file content! Error message: ' + e);
                return;
            }
        }
        
        // Parse test file contents
        let tree: any;
        try {
            tree = this.parser.parseCode(testFileContents);
        } catch (e) {
            this.logger.warn('An error occurred while parsing the test file! Error message: ' + e);
            return;
        }
    
        // Get the namespace for the test file
        const namespaceNode = this.findNamespaceNode(tree.children);
        if (!namespaceNode) {
           this.logger.info(`Unable to find namespace definition in test file: ${testFileUri.toString()}`);
        }
    
        // Get classes for the test file
        const namespaceChildNodes = namespaceNode ? namespaceNode.children : tree;
        const classNode = this.findClassNode(namespaceChildNodes);
        if (!classNode) {
            this.logger.warn(`Unable to find class definition in test file: ${testFileUri.toString()}`);
            return;
        }
    
        // Check if the TestItem for the test file has already been created
        let classTestItem: any;
        if (this.config.get('phpunit.testOrganization', 'file') === 'namespace') {
            // Verify or create hierarchy of namespace TestItems as parent nodes before creating the class test item
            let namespaceTestItem = this.createNamespaceTestItems(namespaceNode, this.ctrl, workspaceFolderUri, testFileUri);
            classTestItem = this.createClassTestItem(classNode, workspaceFolderUri, testFileUri, namespaceTestItem);
        } else if (this.config.get('phpunit.testOrganization', 'file') === 'testsuite') {
    
        } else {
            // Create class test item as a root node
            classTestItem = this.createClassTestItem(classNode, workspaceFolderUri, testFileUri);
        }

        // Create TestItems for test methods within the class
        const methodNodes = this.findTestMethodNodes(classNode.body);
        methodNodes.map((methodNode: any) => {
            this.createMethodTestItem(methodNode, workspaceFolderUri, testFileUri, classTestItem);
        });
        this.logger.trace(`Finished parsing of test file: ${testFileUri.toString()}`);
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
    
        return this.traverseNamespaceHierarchy(workspaceFolderUri, basePath, namespaceParts);
    }
    
    private traverseNamespaceHierarchy(workspaceFolderUri: vscode.Uri, basePath: string, namespaceParts: string[], parentTestItem?: vscode.TestItem): vscode.TestItem {
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
            namespaceTestItem = this.ctrl.items.get(namespaceId);
        }
    
        // If the namespace does not already exist, create it now
        if (!namespaceTestItem) {
            // Create new TestItem for namespace component
            namespaceTestItem = this.ctrl.createTestItem(namespaceId, namespaceLabel!, namespaceUri);
            namespaceTestItem.canResolveChildren = true;
            this.logger.trace('- Created new TestItem for namespace component: ' + namespaceId);
    
            // Add new namespace TestItem as a child in the hierarchy
            let namespaceStr = namespaceLabel;
            if (parentTestItem) {
                parentTestItem.children.add(namespaceTestItem);

                // Rebuild namespace from label and parent test item, and use as the PHPUnit ID for the item
                namespaceStr = this.itemMap.getTestItemDef(parentTestItem)!.getNamespace();
                namespaceStr = namespaceStr + '\\' + namespaceLabel;
            } else {
                this.ctrl.items.add(namespaceTestItem);
            }

            // Add to TestItem map
            const namespaceTestItemDef = new TestItemDefinition(ItemType.folder, workspaceFolderUri, { namespace: namespaceStr });
            this.itemMap.set(namespaceTestItem, namespaceTestItemDef);
        }
    
        // If there are still additional namespace components, continue recursion
        if (namespaceParts.length > 0) {
            return this.traverseNamespaceHierarchy(workspaceFolderUri, basePath, namespaceParts, namespaceTestItem);
        }
    
        // No additional components - this is the end of the recursion
        return namespaceTestItem;
    }
    
    private createClassTestItem(classNode: any, workspaceFolderUri: vscode.Uri, testFileUri: vscode.Uri, parentTestItem?: vscode.TestItem): vscode.TestItem {
        let classId = testFileUri.toString();
        let classLabel = classNode.name.name;
        
        // Check if this already exists as a child of the parent item
        let classTestItem = undefined;
        if (parentTestItem) {
            classTestItem = parentTestItem.children.get(classId);
        } else {
            classTestItem = this.ctrl.items.get(classId);
        }
    
        // If the class does not already exist, create it now
        if (!classTestItem) {
            // Create new TestItem for class
            classTestItem = this.ctrl.createTestItem(classId, classLabel, testFileUri);
            if (classNode.loc) {
                classTestItem.range = new vscode.Range(
                    new vscode.Position(classNode.loc.start.line, classNode.loc.start.column),
                    new vscode.Position(classNode.loc.end.line, classNode.loc.end.column)
                );
            }
            classTestItem.canResolveChildren = true;
            this.logger.trace('- Created new TestItem for class: ' + classId);
        
            // Add new class TestItem as a child in the hierarchy
            let namespace = undefined;
            if (parentTestItem) {
                parentTestItem.children.add(classTestItem);

                // Build fully-qualified class name from label and parent namespace test item, and use as the PHPUnit ID for the item
                namespace = this.itemMap.getTestItemDef(parentTestItem)!.getNamespace();
            } else {
                this.ctrl.items.add(classTestItem);
            }

            // Add to TestItem map
            const classTestItemDef = new TestItemDefinition(ItemType.class, workspaceFolderUri, { namespace: namespace, classname: classLabel });
            this.itemMap.set(classTestItem, classTestItemDef);
        }
        
        return classTestItem;
    }

    private createMethodTestItem(methodNode: any, workspaceFolderUri: vscode.Uri, testFileUri: vscode.Uri, classTestItem: vscode.TestItem): vscode.TestItem {
        // Create TestItem for method
        const methodName = methodNode.name.name;
        const methodId = `${classTestItem!.id}::${methodName}`;
        const methodTestItem = this.ctrl.createTestItem(methodId, methodName, testFileUri);
        if (methodNode.loc) {
            methodTestItem.range = new vscode.Range(
                new vscode.Position(methodNode.loc.start.line, methodNode.loc.start.column),
                new vscode.Position(methodNode.loc.end.line, methodNode.loc.end.column)
            );
        }
        this.logger.trace('- Created new TestItem for method: ' + methodId);

        // Add as a child of the class TestItem
        classTestItem!.children.add(methodTestItem);

        // Add to TestItem map
        let parentTestItemDef = this.itemMap.getTestItemDef(classTestItem)!;
        const methodTestItemDef = new TestItemDefinition(ItemType.method, workspaceFolderUri, { namespace: parentTestItemDef.getNamespace(), classname: parentTestItemDef.getClassname(), method: methodName });
        this.itemMap.set(methodTestItem, methodTestItemDef);

        return methodTestItem;
    }
}
