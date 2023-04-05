import * as vscode from 'vscode';
import { AttrGroup, Attribute, Class, Comment, CommentBlock, Declaration, Engine, Method, Namespace, Node, Parameter, Program, UseGroup } from 'php-parser';
import { Logger } from '../../output';
import { Settings } from '../../settings';
import { ItemType, TestItemDefinition } from './TestItemDefinition';

const patternTestdoxComment = new RegExp(/@testdox (.*)/);
const phpUnitAttributeTest = 'PHPUnit\\Framework\\Attributes\\Test';
const phpUnitAttributeDataProvider = 'PHPUnit\\Framework\\Attributes\\DataProvider';

type TestFileMetadata = {
    namespace?: Namespace, 
    classmap?: Map<string, string>,
    class?: Class
};

export function generateTestItemId(type: ItemType, uri: vscode.Uri, name?: string) {
    let parts: string[] = [
        type,
        uri.toString()
    ];

    if (name) {
        parts.push(name);
    }

    return parts.join('::');
}

export function parseTestItemId(id: string) {
    let parts = id.split('::');
    if (parts.length < 2) {
        return;
    } else if (parts.length === 2) {
        return {
            type: parts[0],
            uri: vscode.Uri.parse(parts[1])
        };
    } 
    return {
        type: parts[0],
        uri: vscode.Uri.parse(parts[1]),
        name: parts[2]
    };
}

export class TestFileParser {
    private settings: Settings;
    private logger: Logger;
    private engine: Engine;

    constructor(
        settings: Settings,
        logger: Logger
    ) {
        this.settings = settings;
        this.logger = logger;

        this.logger.trace('Creating new TestFileParser instance...');
        this.engine = new Engine({
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
                // eslint-disable-next-line @typescript-eslint/naming-convention
                all_tokens: true,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                comment_tokens: true,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                mode_eval: true,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                asp_tags: true,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                short_tags: true
            }
        });
        this.logger.trace('TestFileParser instance created!');
    }

    public parse(
        content: Buffer | string, 
        file: vscode.Uri
    ): TestItemDefinition[] {
        content = content.toString();
        try {
            const ast = this.engine.parseCode(content, file.fsPath);
            return this.parseSymbolTree(ast, file, {});
        } catch (e) {
            this.logger.warn('Unable to load test file content! Error message: ' + e);
            return [];
        }
        
    }

    private parseSymbolTree(
        ast: Program | Namespace | UseGroup | Class | Node, 
        file: vscode.Uri,
        meta: TestFileMetadata
    ): TestItemDefinition[] {
        switch (ast.kind) {
            case 'namespace':
                return this.parseNamespace(ast as Namespace, file, meta);
            case 'usegroup':
                this.parseUseGroup(ast as UseGroup, meta);
                return [];
            case 'class':
                return this.parseClass(ast as Class, file, meta!);
            default:
                return this.parseSymbolTreeChildren(ast, file, meta);
        }
    }

    private parseSymbolTreeChildren(
        ast: Program | Namespace | UseGroup | Class | Node,
        file: vscode.Uri,
        meta: TestFileMetadata,
        parentDefinition?: TestItemDefinition
    ): TestItemDefinition[] {
        if ('children' in ast) {
            return ast.children.reduce(
                (tests, child: Node) => tests.concat(this.parseSymbolTree(child, file, meta) ?? []),
                [] as TestItemDefinition[]
            );
        }

        return [];
    }

    private parseNamespace(
        namespace: Namespace,
        file: vscode.Uri,
        meta: TestFileMetadata
    ): TestItemDefinition[] {
        // Get namespace details
        const namespaceName = namespace.name.toString();
        meta.namespace = namespace;
        return this.parseSymbolTreeChildren(namespace, file, meta);
    }

    private parseUseGroup(
        useGroup: UseGroup,
        meta: TestFileMetadata
    ): void {
        // Create classmap if it doesn't already exist in the metadata
        if (!meta.classmap) {
            meta.classmap = new Map<string, string>();
        }

        // @ts-ignore UseGroup.items is the correct property name
        for (let useItem of useGroup.items) {
            if (useItem.alias) {
                meta.classmap.set(useItem.name, useItem.alias.name);
            } else {
                meta.classmap.set(useItem.name, useItem.name);
            }
        }
    }

    private parseClass(
        phpClass: Class,
        file: vscode.Uri,
        meta: TestFileMetadata,
    ): TestItemDefinition[] {
        let items: TestItemDefinition[] = [];

        // Check that the class is a valid TestCase class
        // At the moment, that just means making sure it isn't abstract
        if (this.isTestClass(phpClass) !== true) {
            return items;
        }

        // Get class details
        const className = this.extractNodeName(phpClass);
        const classId = generateTestItemId(ItemType.class, file, className);

        // Create test item definition for class
        let classDef = new TestItemDefinition(
            ItemType.class,
            file,
            {
                namespaceName: meta.namespace?.name,
                className: className,
                classLabel: this.extractTestdoxName(phpClass.leadingComments),
                classId: classId
            }
        );

        // Add the location range of the class within the file
        if (phpClass.loc) {
            classDef.setRange(
                new vscode.Position((phpClass.loc.start.line - 1), phpClass.loc.start.column),
                new vscode.Position((phpClass.loc.end.line - 1), phpClass.loc.end.column)
            );
        }

        // Process the body of the class to identify any test methods defined
        let methodDefs: TestItemDefinition[] = [];
        for (let node of phpClass.body) {
            if (node.kind !== 'method') {
                continue;
            }
            
            // Check that the method is a valid test method
            let method = node as Method;
            if (this.isTestMethod(method, meta.classmap) !== true) {
                continue;
            }

            // Create definition for test method
            let methodDef = this.parseMethod(method, file, meta, classDef);
            methodDefs.push(methodDef);
        }

        // Only include the class definition if at least one test method has been identified for that class
        if (methodDefs.length > 0) {
            items.push(classDef);
            items.push(...methodDefs);
        }
        return items;
    }

    private parseMethod(
        method: Method,
        file: vscode.Uri,
        meta: TestFileMetadata,
        parentDefinition: TestItemDefinition
    ): TestItemDefinition {
        // Get method details
        const methodName = this.extractNodeName(method);
        const methodId = generateTestItemId(ItemType.method, file, methodName);

        // Create test item definition for method
        let methodDef = new TestItemDefinition(
            ItemType.method,
            file,
            {
                namespaceName: parentDefinition.getNamespaceName(),
                className: parentDefinition.getClassName(),
                classLabel: parentDefinition.getClassLabel(),
                classId: parentDefinition.getClassId(),
                methodName: methodName,
                methodLabel: this.extractTestdoxName(method.leadingComments),
                methodId: methodId,
                dataProvider: this.extractDataProvider(method, meta.classmap)
            }
        );

        // Add the location range of the method within the file
        if (method.loc) {
            methodDef.setRange(
                new vscode.Position((method.loc.start.line - 1), method.loc.start.column),
                new vscode.Position((method.loc.end.line - 1), method.loc.end.column)
            );
        }

        return methodDef;

    }

    private isTestClass(phpClass: Class): boolean {
        if (phpClass.isAbstract) {
            return false;
        }
        return true;
    }

    private isTestMethod(method: Method, classmap?: Map<string, string>): boolean {
        // Test method definitions must be public
        if (method.visibility !== 'public') {
            return false;
        }

        // Test method definitions may be identified by starting with 'test'
        if (this.extractNodeName(method).startsWith('test') === true) {
            return true;
        }

        // Test method definitions may be identified via the @test dockblock annotation
        if (this.hasAnnotation(method.leadingComments, '@test') === true) {
            return true;
        }

        // Test method definitions may be identified via a #[PHPUnit\Framework\Attributes\Test] attribute (new for PHP 8 / PHPUnit 10)
        if (this.hasAttribute(method.attrGroups, phpUnitAttributeTest, classmap) === true) {
            return true;
        }

        return false;
    }

    private extractNodeName(node: Namespace | Class | Method | Declaration): string {
        if (typeof node.name === 'string') {
            return node.name;
        }
        return node.name.name;
    }

    private extractTestdoxName(comments: CommentBlock[] | Comment[] | null): string | undefined {
        if (!comments) {
            return;
        }

        for (let comment of comments) {
            let label = comment.value.match(patternTestdoxComment)?.at(1);
            if (label) {
                return label;
            }
        }
        return;
    }

    private extractDataProvider(method: Method, classmap?: Map<string, string>): string | undefined {
        // Check if data provider has been specified as an attribute (new for PHP 8 / PHPUnit 10)
        if (this.hasAttribute(method.attrGroups, phpUnitAttributeDataProvider, classmap) === true) {
            let args = this.extractAttributeParams(method.attrGroups, phpUnitAttributeDataProvider, classmap);
            if (args.length > 0 && args[0].kind === 'string') {
                // @ts-ignore This will be a string value
                return args[0].value;
            }
        }

        // Check if data provider has been specified in a docblock annotation
        if (this.hasAnnotation(method.leadingComments, '@dataProvider') === true) {
            return this.extractAnnotationValue(method.leadingComments, '@dataProvider');
        }
        return;
    }

    private matchAttribute(attributeGroups: AttrGroup[], attribute: string, classmap?: Map<string, string>): Attribute | undefined {
        let attribs = attributeGroups.reduce((accumulator: Attribute[], group) => accumulator.concat(group.attrs), []);
        for (let attrib of attribs) {
            // Check if attribute matches a fully qualified namespace
            if (attrib.name === attribute) {
                return;
            }

            // Perform additional checks if a classmap has been provided
            if (classmap && classmap.has(attribute)) {
                // Check if attribute matches an aliased class
                if (attrib.name === classmap.get(attribute)) {
                    return attrib;
                }

                // Check if attribute matches an unaliased class
                let attributeParts = attribute.split('\\');
                if (attrib.name === attributeParts.pop()) {
                    return attrib;
                }
            }
        }
        return;
    }

    private hasAttribute(attributeGroups: AttrGroup[], attribute: string, classmap?: Map<string, string>): boolean {
        let attrib = this.matchAttribute(attributeGroups, attribute, classmap);
        if (attrib) {
            return true;
        }
        return false;
    }

    private extractAttributeParams(attributeGroups: AttrGroup[], attribute: string, classmap?: Map<string, string>): Parameter[] {
        let attrib = this.matchAttribute(attributeGroups, attribute, classmap);
        if (!attrib) {
            return [];
        }

        return attrib.args;
    }

    private matchAnnotation(comments: CommentBlock[] | Comment[] | null, annotation: string): RegExpMatchArray | null {
        if (!comments) {
            return null;
        }

        // Strip off leading '@', if it has been provided
        if (annotation.startsWith('@')) {
            annotation = annotation.substring(1);
        }
        
        // Check each comment for the existence of the annotation
        const patternAnnotation = new RegExp('@' + annotation + '( .*)?');
        for (let comment of comments) {
            let results = comment.value.match(patternAnnotation);
            if (results) {
                return results;
            }
        }
        return null;
    }

    private hasAnnotation(comments: CommentBlock[] | Comment[] | null, annotation: string): boolean {
        if (this.matchAnnotation(comments, annotation) !== null) {
            return true;
        }
        return false;
    }

    private extractAnnotationValue(comments: CommentBlock[] | Comment [] | null, annotation: string): string | undefined {
        let matchedAnnotations = this.matchAnnotation(comments, annotation);
        if (matchedAnnotations !== null && matchedAnnotations.length > 1) {
            return matchedAnnotations[1].trim();
        }
        return;
    }
}