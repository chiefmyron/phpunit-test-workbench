/// <reference path="../types/php-parser.d.ts" />
import Engine from 'php-parser';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';

const engine = Engine.create({
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

export async function parseTestFileContents(mode: string, uri: vscode.Uri, ctrl: vscode.TestController, fileContents?: string) {
    // Only need to parse PHP files
    if (uri.scheme !== 'file' || !uri.path.endsWith('.php')) {
        return;
    }
    
    // Check if we need to load file contents from disk
    if (!fileContents) {
        console.info(`Loading contents of '${uri.fsPath}' from disk...`);
		try {
			const rawContent = await vscode.workspace.fs.readFile(uri);
			return new TextDecoder().decode(rawContent);
		} catch (e) {
			console.warn('Unable to load test file contents!', e);
			return;
		}
    }
    
    // Parse test file contents
    const tree: any = engine.parseCode(fileContents);

    // Get the namespace for the test file
    const namespaceNode = findNamespaceNode(tree.children);
    if (!namespaceNode) {
        console.warn(`Unable to find namespace definition in test file: ${uri.toString()}`);
    }

    // Get classes for the test file
    const namespaceChildNodes = namespaceNode ? namespaceNode.children : tree;
    const classNode = findClassNode(namespaceChildNodes);
    if (!classNode) {
        console.error(`Unable to find class definition in test file: ${uri.toString()}`);
        return;
    }

    // Get test methods for class
    const methodNodes = findTestMethodNodes(classNode.body);

    // Check if the TestItem for the test file has already been created
    let classTestItem = ctrl.items.get(uri.toString());
    if (!classTestItem) {
        if (mode === 'namespace') {
            // Verify or create hierarchy of namespace TestItems as parent nodes before creating the class test item
            let namespaceTestItem = createNamespaceTestItems(namespaceNode, ctrl, uri);
            classTestItem = createClassTestItem(classNode, ctrl, uri, namespaceTestItem);
        } else if (mode === 'testsuite') {

        } else {
            // Create class test item as a root node
            classTestItem = createClassTestItem(classNode, ctrl, uri);
        }
    }

    // For each method, create child TestItem
    methodNodes.map((methodNode: any) => {
        // Create TestItem for method
        const methodName = methodNode.name.name;
        const methodId = `${classTestItem!.id}::${methodName}`;
        const methodTestItem = ctrl.createTestItem(methodId, methodName, uri);
        methodTestItem.range = new vscode.Range(
            new vscode.Position(methodNode.loc.start.line, methodNode.loc.start.column),
            new vscode.Position(methodNode.loc.end.line, methodNode.loc.end.column)
        );
        ctrl.items.add(methodTestItem);

        // Add as a child of the class TestItem
        classTestItem!.children.add(methodTestItem);
    });
}

function findNamespaceNode(nodes: any[]): any {
    for (const node of nodes) {
        if (node.kind === 'namespace') {
            return node;
        }
    }
    return;
}

function findClassNode(nodes: any[]): any {
    for (const node of nodes) {
        if (node.kind === 'class' && !node.isAbstract) {
            return node;
        }
    }
    return;
}
    
function findTestMethodNodes(nodes: any[]): any[] {
    return nodes.reduce((methods: any[], node: any) => {
        if (node.kind === 'method' && node.visibility === 'public' && node.name.name.startsWith('test')) {
            return methods.concat(node);
        }

        return methods;
    }, []);
}

function createNamespaceTestItems(namespaceNode: any, ctrl: vscode.TestController, uri: vscode.Uri): vscode.TestItem {
    // Determine the base path for the test file
    const namespace = namespaceNode.name;
    const namespaceParts = namespaceNode.name.split('\\');
    const filePathParts = uri.path.split('/');

    let basePathParts: string[] = [];
    for (const part of filePathParts) {
        if (part === namespaceParts[0]) {
            break;
        }
        basePathParts.push(part);
    }
    const basePath = basePathParts.join('/');
    
    // If the TestItem for the namespace has already been created, no further work required
    let namespaceTestItem = ctrl.items.get(basePath + '/' + namespace);
    if (namespaceTestItem) {
        return namespaceTestItem;
    }

    // Build tree structure based on namespace hierarchy
    let namespacePath = basePath;
    namespaceParts.forEach((part: string) => {
        // Determine URI path for namespace component
        namespacePath = namespacePath + '/' + part;
        const namespaceUri = vscode.Uri.parse(namespacePath);

        // Check if a TestItem has already been created for the namespace component URI
        let item = ctrl.items.get(namespaceUri.toString());
        if (!item) {
            // Create new TestItem for namespace component
            const itemId = namespaceUri.toString();
            const label = part;
            item = ctrl.createTestItem(itemId, label, namespaceUri);
            item.canResolveChildren = true;
            ctrl.items.add(item);
        }

        // Add new namespace TestItem as a child in the hierarchy
        if (namespaceTestItem) {
            namespaceTestItem.children.add(item);
        }
        namespaceTestItem = item;
    });

    return namespaceTestItem!;
}

function createClassTestItem(classNode: any, ctrl: vscode.TestController, uri: vscode.Uri, parentTestItem?: vscode.TestItem): vscode.TestItem {
    const itemId = uri.toString();
    const label = classNode.name.name;
    const classTestItem = ctrl.createTestItem(itemId, label, uri);
    classTestItem.range = new vscode.Range(
        new vscode.Position(classNode.loc.start.line, classNode.loc.start.column),
        new vscode.Position(classNode.loc.end.line, classNode.loc.end.column)
    );
    classTestItem.canResolveChildren = true;
    ctrl.items.add(classTestItem);

    if (parentTestItem) {
        parentTestItem.children.add(classTestItem);
    }
    
    return classTestItem;
}