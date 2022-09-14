/// <reference path="../types/php-parser.d.ts" />
import Engine from 'php-parser';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';

const textDecoder = new TextDecoder('utf-8');
let generationCounter = 0;

export type PhpUnitTestData = TestFile | TestHeading | TestCase;
export const testData = new WeakMap<vscode.TestItem, PhpUnitTestData>();

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

export const getContentFromFilesystem = async (uri: vscode.Uri) => {
    try {
        const rawContent = await vscode.workspace.fs.readFile(uri);
        return textDecoder.decode(rawContent);
    } catch (e) {
        console.warn(`Error providing tests for ${uri.fsPath}`, e);
        return '';
    }
};

export class TestFile {
    public didResolve = false;

    public async updateFromDisk(controller: vscode.TestController, item: vscode.TestItem) {
        try {
            const content = await getContentFromFilesystem(item.uri!);
            item.error = undefined;
            this.updateFromContents(controller, content, item);
        } catch (e) {
            item.error = (e as Error).stack;
        }
    }

    public updateFromContents(controller:vscode.TestController, content: string, item: vscode.TestItem) {
        // Get initial set of nodes from file content
        const tree: any = engine.parseCode(content);
        
        // Get a list of classes defined in the file
        const classes = this.findClasses(tree.children);

        // For each class, get the set of test methods
        classes.map((classNode: any) => {
            // Create TestItem for class
            const className = classNode.name.name;
            const classId = `${item.uri}/${className}`;
            const classTestItem = controller.createTestItem(classId, className, item.uri);
            classTestItem.range = new vscode.Range(
                new vscode.Position(classNode.loc.start.line, classNode.loc.start.column),
                new vscode.Position(classNode.loc.end.line, classNode.loc.end.column)
            );

            // Get a list of methods defined in the class
            const methods = this.findTestMethods(classNode.body);

            // For each method, create child TestItem
            methods.map((methodNode: any) => {
                // Create TestItem for method
                const methodName = methodNode.name.name;
                const methodId = `${classId}/${methodName}`;
                const methodTestItem = controller.createTestItem(methodId, methodName, item.uri);
                methodTestItem.range = new vscode.Range(
                    new vscode.Position(methodNode.loc.start.line, methodNode.loc.start.column),
                    new vscode.Position(methodNode.loc.end.line, methodNode.loc.end.column)
                );

                // Add as a child of the parent class
                classTestItem.children.add(methodTestItem);
            });

            // Add class to parent TestItem for file
            item.children.add(classTestItem);
        });
    }

    private findClasses(nodes: any[]): any[] {
        return nodes.reduce((classes: any[], node: any) => {
            if (node.kind === 'namespace') {
                return classes.concat(this.findClasses(node.children));
            }

            if (node.kind === 'class' && !node.isAbstract) {
                return classes.concat(node);
            }

            return classes;
        }, []);
    }

    private findTestMethods(nodes: any[]): any[] {
        return nodes.reduce((methods: any[], node: any) => {
            if (node.kind === 'method' && node.visibility == 'public' && node.name.name.startsWith('test')) {
                return methods.concat(node);
            }

            return methods;
        }, []);
    }
}

export class TestHeading {
    constructor(public generation: number) { }
}

export class TestCase {
    constructor(
        private readonly namespace: string,
        private readonly methodName: string
    ) { }

    getNamespace() {
        return this.namespace;
    }

    getLabel() {
        return this.methodName;
    }
}