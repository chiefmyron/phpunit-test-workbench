import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import Engine from 'php-parser';
import { TextDecoder } from 'util';
import { Settings } from '../settings';
import { Logger } from '../output';
import { ItemType, TestItemDefinition } from './TestItemDefinition';
import { TestItemMap } from './TestItemMap';
import { TestSuiteMap } from '../suites/TestSuiteMap';
import { TestSuite } from '../suites/TestSuite';

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
    private ctrl: vscode.TestController;
    private testItemMap: TestItemMap;
    private testSuiteMap: TestSuiteMap;
    private settings: Settings;
    private phpParser: Engine;
    private xmlParser: xml2js.Parser;
    private logger: Logger;

    constructor(
        ctrl: vscode.TestController,
        testItemMap: TestItemMap,
        testSuiteMap: TestSuiteMap,
        settings: Settings,
        logger: Logger
    ) {
        this.ctrl = ctrl;
        this.testItemMap = testItemMap;
        this.testSuiteMap = testSuiteMap;
        this.settings = settings;
        this.logger = logger;

        this.logger.trace('Creating new TestFileParser instance...');
        this.phpParser = Engine.create({
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
        this.xmlParser = new xml2js.Parser();
        this.logger.trace('TestFileParser instance created!');
    }

    /***********************************************************************/
    /* Settings value wrappers and defaults                                */
    /***********************************************************************/

    private getTestDirectory(workspaceFolder?: vscode.WorkspaceFolder): string {
        return this.settings.get('phpunit.testDirectory', 'tests', workspaceFolder);
    }

    private getTestSuffixes(workspaceFolder?: vscode.WorkspaceFolder): string[] {
        let testFileSuffixes: string = this.settings.get('phpunit.testFileSuffix', 'Test.php,.phpt', workspaceFolder);
        return testFileSuffixes.split(',');
    }

    private getTestSuffixGlob(workspaceFolder?: vscode.WorkspaceFolder): string {
        let testFileSuffixes = this.getTestSuffixes(workspaceFolder);
        testFileSuffixes.map((value: string, index: number) => { testFileSuffixes[index] = '*' + value; });
        return '{' + testFileSuffixes.join(',') + '}';
    }

    private getTestLocatorPattern(workspaceFolder?: vscode.WorkspaceFolder) {
        let pattern = this.getTestDirectory(workspaceFolder) + '/**/' + this.getTestSuffixGlob(workspaceFolder);
        this.logger.trace('Using locator pattern for test file identification: ' + pattern);
        return pattern;
    }

    private getPhpUnitConfigXmlLocatorPattern(workspaceFolder?: vscode.WorkspaceFolder) {
        let pattern = this.settings.get('phpunit.locatorPatternConfigXml', 'phpunit.xml', workspaceFolder);
        this.logger.trace('Using locator pattern for configuration file identification: ' + pattern);
        return pattern;
    }

    /***********************************************************************/
    /* Test controller operations                                          */
    /***********************************************************************/

    public clearTestControllerItems() {
        this.ctrl.items.forEach(item => this.ctrl.items.delete(item.id));
        this.testItemMap.clear();
    }

    public removeTestFile(testItemId: string) {
        this.ctrl.items.delete(testItemId);
        this.testItemMap.delete(testItemId);
    }

    /***********************************************************************/
    /* Workspace file system watcher operations                            */
    /***********************************************************************/

    public async setWorkspaceFileSystemWatchers() {
        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        // Discover relevant files in all workspace folders
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                // Get glob pattern definition for location of PHPUnit configuration files
                const configPatternStr = this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder);
                const configPattern = new vscode.RelativePattern(workspaceFolder, configPatternStr);

                // Add event handler to clean up test suites on config file delete
                const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);
                configWatcher.onDidDelete(configFileUri => this.testSuiteMap.deleteConfigFileTestSuites(configFileUri));

                // Add event handler to saved configuration files
                // This should trigger a refresh of test files (as test suite definitions may have changed)
                vscode.workspace.onDidSaveTextDocument(document => this.refreshTestFilesInWorkspace());

                // Parse configuration file immediately (this is required to retrieve test suite definitions, in case
                // test methods are organised by suite - see below)
                await this.parseConfigFilesInWorkspaceFolder(workspaceFolder, configPattern);

                // Locate test methods. Depending on settings, tests could be identified by test suites defined in
                // PHPUnit configuration files, or by a glob pattern
                if (this.settings.get('phpunit.useTestSuiteDefinitions', false) === true) {
                    // Tests are identified by test suites in PHPUnit configuration file for the workspace
                    let testSuites = this.testSuiteMap.getWorkspaceTestSuites(workspaceFolder);
                    for (let testSuite of testSuites) {
                        // Get glob pattern definition for location of test class files
                        let testSuffixGlob = this.getTestSuffixGlob(workspaceFolder);
                        let patterns = testSuite.getGlobsForTestSuiteItems(testSuffixGlob);
                        await this.setFileSystemWatcherForPatterns(patterns, workspaceFolder, testSuite);
                    }
                } else {
                    // Tests are identified by a glob pattern in a target directory
                    const testPatternStr = this.getTestLocatorPattern(workspaceFolder);
                    let patterns: vscode.RelativePattern[] = [
                        new vscode.RelativePattern(workspaceFolder, testPatternStr)
                    ];
                    await this.setFileSystemWatcherForPatterns(patterns, workspaceFolder);
                }
            })
        );
    }

    private async setFileSystemWatcherForPatterns(patterns: vscode.RelativePattern[], workspaceFolder: vscode.WorkspaceFolder, testSuite?: TestSuite) {
        for (let pattern of patterns) {
            // Set watcher for new, changed or deleted test files within the workspace
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            // Set file related event handlers
            watcher.onDidCreate(fileUri => this.parseTestFileContents(workspaceFolder, fileUri, testSuite));
            watcher.onDidChange(fileUri => this.parseTestFileContents(workspaceFolder, fileUri, testSuite));
            watcher.onDidDelete(fileUri => this.removeTestFile(fileUri.toString()));

            // Find initial set of files for workspace
            for (const fileUri of await vscode.workspace.findFiles(pattern)) {
                await this.parseTestFileContents(workspaceFolder, fileUri, testSuite);
            }
        }
    }

    /***********************************************************************/
    /* Test controller refresh event handler                               */
    /***********************************************************************/

    public async refreshTestFilesInWorkspace() {
        // Reset test controller
        this.clearTestControllerItems();

        // Reset any existing stored test suite definitions
        this.testSuiteMap.clear();

        // Parse files in all workspace folders
        return this.parseTestFilesInWorkspace();
    }

    public async parseTestFilesInWorkspace() {
        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        // Parse files for each workspace folder
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                // Get glob pattern definition for location of PHPUnit configuration files
                const configPatternStr = this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder);
                const configPattern = new vscode.RelativePattern(workspaceFolder, configPatternStr);
                await this.parseConfigFilesInWorkspaceFolder(workspaceFolder, configPattern);

                // Locate test methods. Depending on settings, tests could be identified by test suites defined in
                // PHPUnit configuration files, or by a glob pattern
                if (this.settings.get('phpunit.useTestSuiteDefinitions', false) === true) {
                    // Tests are identified by test suites in PHPUnit configuration file for the workspace
                    let testSuites = this.testSuiteMap.getWorkspaceTestSuites(workspaceFolder);
                    for (let testSuite of testSuites) {
                        // Get glob pattern definition for location of test class files
                        let testSuffixGlob = this.getTestSuffixGlob(workspaceFolder);
                        let patterns = testSuite.getGlobsForTestSuiteItems(testSuffixGlob);
                        for (let pattern of patterns) {
                            await this.parseTestFilesInWorkspaceFolder(workspaceFolder, pattern, testSuite);
                        }
                    }
                } else {
                    // Tests are identified by a glob pattern in a target directory
                    const testPatternStr = this.getTestLocatorPattern(workspaceFolder);
                    let pattern = new vscode.RelativePattern(workspaceFolder, testPatternStr);
                    await this.parseTestFilesInWorkspaceFolder(workspaceFolder, pattern);
                }
            })
        );
    }

    /***********************************************************************/
    /* Wrappers for parsing config files, text files and open documents    */
    /***********************************************************************/

    public async parseConfigFilesInWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder, pattern: vscode.RelativePattern) {
        const configFileUris = await vscode.workspace.findFiles(pattern);
        for (const configFileUri of configFileUris) {
            await this.parseConfigFileContents(workspaceFolder, configFileUri);
        }
    }

    public async parseTestFilesInWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder, pattern: vscode.RelativePattern, testSuite?: TestSuite) {
        const testFileUris = await vscode.workspace.findFiles(pattern);
        for (const testFileUri of testFileUris) {
            await this.parseTestFileContents(workspaceFolder, testFileUri, testSuite);
        }
    }

    public async parseOpenDocument(document: vscode.TextDocument) {
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return;
        }

        // Check if this document matches the pattern defined for configuration XML files for the workspace
        const patternConfig = new vscode.RelativePattern(workspaceFolder, this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder));
        if (vscode.languages.match({ pattern: patternConfig }, document) !== 0) {
            this.parseConfigFileContents(workspaceFolder, document.uri, document.getText());
            return;
        }

        // If there are no test suties defined for this workspace folder, check against the test directory and suffix defined in settings
        if (this.settings.get('phpunit.useTestSuiteDefinitions', false, workspaceFolder) !== true) {
            let pattern = new vscode.RelativePattern(workspaceFolder, this.getTestLocatorPattern(workspaceFolder));
            if (vscode.languages.match({ pattern: pattern }, document) !== 0) {
                this.parseTestFileContents(workspaceFolder, document.uri, undefined, document.getText());
            }
            return;
        }

        // Get test suites for the workspace folder, and check if the document matches a file or directory definition
        let testSuffixGlob = this.getTestSuffixGlob(workspaceFolder);
        let testSuites = this.testSuiteMap.getWorkspaceTestSuites(workspaceFolder);
        for (let testSuite of testSuites) {
            // Set file system watcher for patterns
            let patterns = testSuite.getGlobsForTestSuiteItems(testSuffixGlob);
            for (let pattern of patterns) {
                if (vscode.languages.match({ pattern: pattern }, document) !== 0) {
                    this.parseTestFileContents(workspaceFolder, document.uri, testSuite, document.getText());
                    return;
                }
            }
        }

        return;
    }

    /***********************************************************************/
    /* Test class parsing logic                                            */
    /***********************************************************************/

    public async parseTestFileContents(workspaceFolder: vscode.WorkspaceFolder, testFileUri: vscode.Uri, testSuite?: TestSuite, testFileContents?: string) {
        const workspaceFolderUri = workspaceFolder.uri;
        
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
            tree = this.phpParser.parseCode(testFileContents, testFileUri.fsPath);
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

        // Check if a TestItem has already been created for a parent test suite
        let testSuiteTestItem: vscode.TestItem | undefined = undefined;
        if (this.settings.get('phpunit.useTestSuiteDefinitions', false, workspaceFolder) === true && testSuite) {
            testSuiteTestItem = this.createTestSuiteTestItem(testSuite, workspaceFolderUri);
        }
    
        // Check if the TestItem for the test file has already been created
        let classTestItem: any;
        if (this.settings.get('phpunit.testOrganization', 'file') === 'namespace') {
            // Verify or create hierarchy of namespace TestItems as parent nodes before creating the class test item
            let namespaceTestItem = this.createNamespaceTestItems(namespaceNode, workspaceFolder, testFileUri, testSuiteTestItem);
            classTestItem = this.createClassTestItem(classNode, workspaceFolderUri, testFileUri, namespaceTestItem);
        } else {
            // Create class test item as a root node
            classTestItem = this.createClassTestItem(classNode, workspaceFolderUri, testFileUri, testSuiteTestItem);
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
            if (node.kind === 'method' && node.visibility === 'public') {
                // Identify test methods starting with 'test'
                if (node.name.name.startsWith('test')) {
                    return methods.concat(node);
                }

                // Identify test methods associated with an '@test' docblock annotation
                if (node.leadingComments && node.leadingComments[0] && node.leadingComments[0].value.indexOf('@test', -1) > -1) {
                    return methods.concat(node);
                }
            }
            return methods;
        }, []);
    }

    private createTestSuiteTestItem(testSuite: TestSuite, workspaceFolderUri: vscode.Uri): vscode.TestItem {
        let testSuiteId = generateTestItemId(ItemType.testsuite, testSuite.getConfigFileUri(), testSuite.getName());
        let testSuiteLabel = 'SUITE: ' + testSuite.getName();
        
        // Check if this already exists as a child of the parent item
        let testSuiteTestItem = this.ctrl.items.get(testSuiteId);
    
        // If the class does not already exist, create it now
        if (!testSuiteTestItem) {
            // Create new TestItem for test suite
            testSuiteTestItem = this.ctrl.createTestItem(testSuiteId, testSuiteLabel, testSuite.getConfigFileUri());
            // if (classNode.loc) {
            //     classTestItem.range = new vscode.Range(
            //         new vscode.Position(classNode.loc.start.line, classNode.loc.start.column),
            //         new vscode.Position(classNode.loc.end.line, classNode.loc.end.column)
            //     );
            // }
            testSuiteTestItem.canResolveChildren = true;
            this.logger.trace('- Created new TestItem for test suite: ' + testSuiteId);
            this.ctrl.items.add(testSuiteTestItem);

            // Add to TestItem map
            const testSuiteTestItemDef = new TestItemDefinition(ItemType.testsuite, workspaceFolderUri, { testsuite: testSuite.getName() });
            this.testItemMap.set(testSuiteTestItem, testSuiteTestItemDef);
        }
        
        return testSuiteTestItem;
    }
    
    private createNamespaceTestItems(namespaceNode: any, workspaceFolder: vscode.WorkspaceFolder, namespaceFolderUri: vscode.Uri, parentTestItem?: vscode.TestItem): vscode.TestItem | undefined {
        let namespace: string = namespaceNode.name;
        let namespaceHierarchyRoot = parentTestItem;

        // If the test directory has been mapped to a namespace, create a new TestItem to cover all of those namespace segments
        let testDirectoryUri = workspaceFolder.uri.with({path: workspaceFolder.uri.path + '/' + this.getTestDirectory(workspaceFolder)});
        let namespacePrefix: string = this.settings.get('phpunit.testNamespacePrefix', '', workspaceFolder);
        if (namespacePrefix && namespacePrefix.length > 0) {
            // Create a single namespace node that covers the entire test namespace prefix
            let namespaceId = generateTestItemId(ItemType.namespace, testDirectoryUri);

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
                namespaceTestItem = this.ctrl.createTestItem(namespaceId, namespacePrefix, testDirectoryUri);
                namespaceTestItem.canResolveChildren = true;
                this.logger.trace('- Created new TestItem for test namespace prefix: ' + namespaceId);
        
                // Add new namespace TestItem as a child in the hierarchy
                let testSuiteStr = undefined;
                if (parentTestItem) {
                    parentTestItem.children.add(namespaceTestItem);

                    // Rebuild namespace from label and parent test item, and use as the PHPUnit ID for the item
                    let parentTestItemDef = this.testItemMap.getTestItemDef(parentTestItem)!;
                    testSuiteStr = parentTestItemDef.getTestSuite();
                } else {
                    this.ctrl.items.add(namespaceTestItem);
                }

                // Add to TestItem map
                const namespaceTestItemDef = new TestItemDefinition(ItemType.namespace, workspaceFolder.uri, { testsuite: testSuiteStr, namespace: namespacePrefix });
                this.testItemMap.set(namespaceTestItem, namespaceTestItemDef);
            }

            // Set the namespace hierarchy root to be the prefix namespace TestItem
            namespaceHierarchyRoot = namespaceTestItem;

            // Remove namespace prefix
            namespacePrefix = namespacePrefix.replace(/\\/g, '\\'); // Fix for escaped backslashes
            namespace = namespace.replace(namespacePrefix, '');
            if (namespace.startsWith('\\')) {
                namespace = namespace.replace('\\', '');
            }

            // If there are no remaining segments, return the prefix namespace TestItem immediately
            if (namespace.length <= 0) {
                return namespaceTestItem;
            }
        }

        // Split the namespace into segments and traverse the hierarchy
        const namespaceParts = namespace.split('\\');
        if (namespaceParts.length > 0) {
            return this.traverseNamespaceHierarchy(workspaceFolder.uri, testDirectoryUri, namespaceParts, namespaceHierarchyRoot);
        } else {
            return parentTestItem;
        }
    }
    
    private traverseNamespaceHierarchy(workspaceFolderUri: vscode.Uri, basePath: vscode.Uri, namespaceParts: string[], parentTestItem?: vscode.TestItem): vscode.TestItem {
        // Get name of this namespace component
        let namespaceId: string;
        let namespaceUri: vscode.Uri;
        let namespaceLabel = namespaceParts.shift();
        
        // Determine URI for the associated namespace folder
        if (parentTestItem && parseTestItemId(parentTestItem.id)!.type === ItemType.namespace) {
            // Use parent namespace as the base for this namespace
            let parentUri = parentTestItem.uri!;
            namespaceUri = parentUri.with({ path: parentUri.path + '/' + namespaceLabel });
        } else {
            // Use default values for top level namespace
            namespaceUri = basePath.with({ path: basePath.path + '/' + namespaceLabel });
        }
        namespaceId = generateTestItemId(ItemType.namespace, namespaceUri);
    
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
            let testSuiteStr = undefined;
            let namespaceStr = namespaceLabel;
            if (parentTestItem) {
                parentTestItem.children.add(namespaceTestItem);

                // Rebuild namespace from label and parent test item, and use as the PHPUnit ID for the item
                let parentTestItemDef = this.testItemMap.getTestItemDef(parentTestItem)!;
                testSuiteStr = parentTestItemDef.getTestSuite();
                if (parseTestItemId(parentTestItem.id)!.type === ItemType.namespace) {
                    namespaceStr = parentTestItemDef.getNamespace() + '\\' + namespaceLabel;
                }
            } else {
                this.ctrl.items.add(namespaceTestItem);
            }

            // Add to TestItem map
            const namespaceTestItemDef = new TestItemDefinition(ItemType.namespace, workspaceFolderUri, { testsuite: testSuiteStr, namespace: namespaceStr });
            this.testItemMap.set(namespaceTestItem, namespaceTestItemDef);
        }
    
        // If there are still additional namespace components, continue recursion
        if (namespaceParts.length > 0) {
            return this.traverseNamespaceHierarchy(workspaceFolderUri, basePath, namespaceParts, namespaceTestItem);
        }
    
        // No additional components - this is the end of the recursion
        return namespaceTestItem;
    }
    
    private createClassTestItem(classNode: any, workspaceFolderUri: vscode.Uri, testFileUri: vscode.Uri, parentTestItem?: vscode.TestItem): vscode.TestItem {
        let classId = generateTestItemId(ItemType.class, testFileUri);
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
            this.logger.trace('- Created new TestItem for class: ' + testFileUri.toString());
        
            // Add new class TestItem as a child in the hierarchy
            let testsuite = undefined;
            let namespace = undefined;
            if (parentTestItem) {
                parentTestItem.children.add(classTestItem);

                // Build fully-qualified class name from label and parent namespace test item, and use as the PHPUnit ID for the item
                let parentTestItemDef = this.testItemMap.getTestItemDef(parentTestItem);
                if (parentTestItemDef) {
                    testsuite = parentTestItemDef.getTestSuite();
                    namespace = parentTestItemDef.getNamespace();
                }
                
            } else {
                this.ctrl.items.add(classTestItem);
            }

            // Add to TestItem map
            const classTestItemDef = new TestItemDefinition(ItemType.class, workspaceFolderUri, { testsuite: testsuite, namespace: namespace, classname: classLabel });
            this.testItemMap.set(classTestItem, classTestItemDef);
        }
        
        return classTestItem;
    }

    private createMethodTestItem(methodNode: any, workspaceFolderUri: vscode.Uri, testFileUri: vscode.Uri, classTestItem: vscode.TestItem): vscode.TestItem {
        // Create TestItem for method
        const methodName = methodNode.name.name;
        const methodId = generateTestItemId(ItemType.method, testFileUri, methodName);
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
        let parentTestItemDef = this.testItemMap.getTestItemDef(classTestItem)!;
        const methodTestItemDef = new TestItemDefinition(ItemType.method, workspaceFolderUri, { testsuite: parentTestItemDef.getTestSuite(), namespace: parentTestItemDef.getNamespace(), classname: parentTestItemDef.getClassname(), method: methodName });
        this.testItemMap.set(methodTestItem, methodTestItemDef);

        return methodTestItem;
    }

    /***********************************************************************/
    /* PHPUnit configuration file parsing logic                            */
    /***********************************************************************/

    public async parseConfigFileContents(workspaceFolder: vscode.WorkspaceFolder, configFileUri: vscode.Uri, configFileContents?: string) {
        const workspaceFolderUri = workspaceFolder.uri;
        
        // Check if we need to load file contents from disk
        this.logger.trace(`Parsing contents of file for configuration: ${configFileUri.toString()}`);
        if (!configFileContents) {
            this.logger.trace('Loading config file contents from disk...');
            try {
                const rawContent = await vscode.workspace.fs.readFile(configFileUri);
                configFileContents = new TextDecoder().decode(rawContent);
            } catch (e) {
                this.logger.warn('Unable to load config file content! Error message: ' + e);
                return;
            }
        }

        // Parse file contents
        try {
            this.xmlParser.parseStringPromise(configFileContents).then((result) => {
                if (result.phpunit && result.phpunit.testsuites && result.phpunit.testsuites[0] && result.phpunit.testsuites[0].testsuite) {
                    for (let testsuite of result.phpunit.testsuites[0].testsuite) {
                        // Get test suite details
                        let name = testsuite.$.name;
                        let suite = new TestSuite(workspaceFolderUri, configFileUri, name);

                        if (testsuite.directory) {
                            for (let directory of testsuite.directory) {
                                if (typeof directory !== 'string' && directory._ && directory.$.suffix) {
                                    suite.addDirectory(directory._, directory.$.suffix);
                                } else {
                                    suite.addDirectory(directory);
                                }
                            }
                        }

                        if (testsuite.file) {
                            for (let file of testsuite.file) {
                                suite.addFile(file);
                            }
                        }

                        
                        this.testSuiteMap.set(suite);
                    }
                }
                return;
            })
            .catch((err) => {
                this.logger.warn('Error while parsing configuration file XML!');
                this.logger.warn(`Configuration file: ${configFileUri.fsPath}`);
                this.logger.warn(`Error message: ${err}`);
                return;
            });
        } catch (e) {
            this.logger.warn('Error while parsing configuration file XML!');
            this.logger.warn(`Configuration file: ${configFileUri.fsPath}`);
            this.logger.warn(`Error message: ${e}`);
            return;
        }
    }
}
