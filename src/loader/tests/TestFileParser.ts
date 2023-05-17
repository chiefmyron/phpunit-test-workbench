import * as vscode from 'vscode';
import { AttrGroup, Attribute, Class, Comment, CommentBlock, Declaration, Engine, Method, Namespace, Node, Parameter, Program, UseGroup } from 'php-parser';
import { Logger } from '../../output';
import { Settings } from '../../settings';
import { ItemType, TestItemDefinition } from './TestItemDefinition';

const phpUnitAttributeTest = 'PHPUnit\\Framework\\Attributes\\Test';
const phpUnitAttributeDataProvider = 'PHPUnit\\Framework\\Attributes\\DataProvider';
const phpUnitAttributeDataProviderExternal = 'PHPUnit\\Framework\\Attributes\\DataProviderExternal';
const phpUnitAttributeGroup = 'PHPUnit\\Framework\\Attributes\\Group';
const phpUnitAttributeSmall = 'PHPUnit\\Framework\\Attributes\\Small';
const phpUnitAttributeMedium = 'PHPUnit\\Framework\\Attributes\\Medium';
const phpUnitAttributeLarge = 'PHPUnit\\Framework\\Attributes\\Large';
const phpUnitAttributeTicket = 'PHPUnit\\Framework\\Attributes\\Ticket';

const patternAnnotationTest = new RegExp(/@test\b/);
const patternAnnotationTestdox = new RegExp(/@testdox (.*)/);
const patternAnnotationDataProvider = new RegExp(/@dataProvider (.*)/);
const patternAnnotationGroup = new RegExp(/@group (.*)/);
const patternAnnotationTicket = new RegExp(/@ticket (.*)/);
const patternAnnotationSmall = new RegExp(/@small\b/);
const patternAnnotationMedium = new RegExp(/@medium\b/);
const patternAnnotationLarge = new RegExp(/@large\b/);

type TestFileMetadata = {
    namespace?: Namespace, 
    classmap?: Map<string, string>,
    class?: Class
};

type Annotation = {
    name: string,
    values: string[]
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
                classId: classId,
                tags: this.extractTagsList(phpClass)
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
                dataProviders: this.extractDataProviders(method, meta.classmap),
                tags: parentDefinition.getTags().concat(this.extractTagsList(method, meta.classmap))
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
        if (this.hasAnnotation(method.leadingComments, patternAnnotationTest) === true) {
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
            let label = comment.value.match(patternAnnotationTestdox)?.at(1);
            if (label) {
                return label;
            }
        }
        return;
    }

    private extractDataProviders(method: Method, classmap?: Map<string, string>): string[] {
        let dataProviders: string[] = [];
        const dataProviderAttributes = [
            phpUnitAttributeDataProvider,
            phpUnitAttributeDataProviderExternal
        ];
        
        // Check if data providers have been specified as an attribute (new for PHP 8 / PHPUnit 10)
        let attribs = this.matchAttributes(method.attrGroups, dataProviderAttributes, classmap);
        attribs.forEach(attrib => {
            let param = this.extractParameterValue(attrib.args, 0);
            if (param) {
                dataProviders.push(param);
            }
        });

        // NOTE: Attributes take precedence over annotations in PHPUnit 10. If we have found at 
        // least one value, then annotations are ignored
        if (dataProviders.length > 0) {
            return dataProviders;
        }

        // Check if data providers have been specified as an annotation
        return this.extractAnnotationValues(method.leadingComments, patternAnnotationDataProvider);
    }

    private extractTagsList(node: Class | Method, classmap?: Map<string, string>): string[] {
        let tags: string[] = [];
        const tagAttributes = [
            phpUnitAttributeGroup,
            phpUnitAttributeSmall,
            phpUnitAttributeMedium,
            phpUnitAttributeLarge,
            phpUnitAttributeTicket
        ];
        const tagAnnotations = [
            patternAnnotationGroup,
            patternAnnotationTicket,
            patternAnnotationSmall,
            patternAnnotationMedium,
            patternAnnotationLarge
        ];

        // Check for group attributes
        let attribs = this.matchAttributes(node.attrGroups, tagAttributes, classmap);
        attribs.forEach(attrib => {
            // Extract tag value from attribute parameter (covers 'group' and 'ticket' attributes)
            let tag = this.extractParameterValue(attrib.args, 0);

            // If tag not found, the tag value is the name of the attribute
            if (!tag) {
                let attribParts = attrib.name.split('\\');
                tag = attribParts.pop();
            }

            // If tag has been found, and not already present in list, add it now
            if (tag && tags.includes(tag) !== true) {
                tags.push(tag);
            }
        });

        // NOTE: Attributes take precedence over annotations in PHPUnit 10. If we have found at 
        // least one value, then annotations are ignored
        if (tags.length > 0) {
            return tags;
        }

        let annotations = this.matchAnnotations(node.leadingComments, tagAnnotations);
        annotations.forEach(annotation => {
            let tag = undefined;

            // Extract tag value from annotation text (covers '@group' and '@ticket' annotations)
            if (annotation.values.length > 0) {
                tag = annotation.values[0].trim();
            }

            // If tag not found, the tag value is the name of the annotation
            if (!tag) {
                tag = annotation.name.trim();
            }

            // If tag has been found, and not already present in list, add it now
            if (tag && tags.includes(tag) !== true) {
                tags.push(tag);
            }
        });

        return tags;
    }

    private matchAttributes(attributeGroups: AttrGroup[], attributes: string[], classmap?: Map<string, string>): Attribute[] {
        let matchedAttribs: Attribute[] = [];
        attributes.forEach(attrib => {
            matchedAttribs = matchedAttribs.concat(this.matchAttribute(attributeGroups, attrib, classmap));
        });
        return matchedAttribs;
    }

    private matchAttribute(attributeGroups: AttrGroup[], attribute: string, classmap?: Map<string, string>): Attribute[] {
        let attribs = attributeGroups.reduce((accumulator: Attribute[], group) => accumulator.concat(group.attrs), []);

        let matchedAttribs: Attribute[] = [];
        for (let attrib of attribs) {
            // Check if attribute matches a fully qualified namespace
            if (attrib.name === attribute) {
                matchedAttribs.push(attrib);
                continue;
            }

            // Perform additional checks if a classmap has been provided
            if (classmap && classmap.has(attribute)) {
                // Check if attribute matches an aliased class
                if (attrib.name === classmap.get(attribute)) {
                    matchedAttribs.push(attrib);
                    continue;
                }

                // Check if attribute matches an unaliased class
                let attributeParts = attribute.split('\\');
                if (attrib.name === attributeParts.pop()) {
                    matchedAttribs.push(attrib);
                    continue;
                }
            }
        }
        return matchedAttribs;
    }

    private hasAttribute(attributeGroups: AttrGroup[], attribute: string, classmap?: Map<string, string>): boolean {
        let attrib = this.matchAttribute(attributeGroups, attribute, classmap);
        if (attrib.length > 0) {
            return true;
        }
        return false;
    }

    private matchAnnotations(comments: CommentBlock[] | Comment [] | null, annotations: RegExp[]): Annotation[] {
        let matchedAnnotations: Annotation[] = [];
        annotations.forEach(annotation => {
            matchedAnnotations = matchedAnnotations.concat(this.matchAnnotation(comments, annotation));
        });
        return matchedAnnotations;
    }

    private matchAnnotation(comments: CommentBlock[] | Comment[] | null, annotation: RegExp): Annotation[] {
        let annotations: Annotation[] = [];
        if (!comments) {
            return annotations;
        }
        
        // Check each comment for the existence of the annotation
        for (let comment of comments) {
            let results = comment.value.match(annotation);
            if (results) {
                // Extract annotation name from result
                let match = results.shift()!;
                let value = match.split(" ")[0].replace("@", "");
                annotations = annotations.concat({name: value, values: results});
            }
        }
        return annotations;
    }

    private hasAnnotation(comments: CommentBlock[] | Comment[] | null, annotation: RegExp): boolean {
        if (this.matchAnnotation(comments, annotation).length > 0) {
            return true;
        }
        return false;
    }

    private extractAnnotationValues(comments: CommentBlock[] | Comment [] | null, annotation: RegExp): string[] {
        let values: string[] = [];
        let matchedAnnotations = this.matchAnnotation(comments, annotation);
        matchedAnnotations.forEach(annotation => {
            if (annotation.values.length > 0) {
                values.push(annotation.values[0].trim());
            }
        });
        return values;
    }

    private extractParameterValue(parameters: Parameter[], index: number): string | undefined {
        if (!parameters || parameters.length <= 0 || !parameters[index]) {
            return;
        }
        if (parameters[index].kind !== 'string' || parameters[index].value === null) {
            return;
        }

        return parameters[index].value!.toString();
    }
}