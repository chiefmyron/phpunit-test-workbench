import * as vscode from 'vscode';
import { Settings } from '../settings';
import { Logger } from '../output';
import { generateTestItemId, TestFileParser } from './tests/TestFileParser';
import { ItemType, TestItemDefinition } from './tests/TestItemDefinition';
import { TestItemMap } from './tests/TestItemMap';
import { TestSuiteMap } from './suites/TestSuiteMap';
import { TestSuite } from './suites/TestSuite';
import { ConfigFileParser } from './configs/ConfigFileParser';

export class TestFileLoader {
    private ctrl: vscode.TestController;
    private testItemMap: TestItemMap;
    private testSuiteMap: TestSuiteMap;
    private settings: Settings;
    private logger: Logger;
    private watchers: vscode.FileSystemWatcher[];
    private configParser: ConfigFileParser;
    private testParser: TestFileParser;

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
        this.watchers = [];

        this.configParser = new ConfigFileParser(settings, logger);
        this.testParser = new TestFileParser(settings, logger);
        
    }

    /***********************************************************************/
    /* Test controller operations                                          */
    /***********************************************************************/

    public clearTestControllerItems() {
        this.ctrl.items.forEach(item => this.ctrl.items.delete(item.id));
        this.testItemMap.clear();
    }

    public removeTestFile(testFileUri: vscode.Uri) {
        // Find TestItem for the class defined in this file
        let classTestItem = this.testItemMap.getTestItemForClass(testFileUri);
        if (!classTestItem) {
            return;
        }

        // Delete test item definitions for methods within the test class
        classTestItem.children.forEach(methodTestItem => this.testItemMap.delete(methodTestItem));

        // Delete test item for the class from its parent
        let parentTestItem = classTestItem.parent;
        if (parentTestItem) {
            parentTestItem.children.delete(classTestItem.id);
            if (parentTestItem.children.size <= 0) {
                if (parentTestItem.parent) {
                    parentTestItem.parent.children.delete(parentTestItem.id);
                } else {
                    this.ctrl.items.delete(parentTestItem.id);
                }
            }
        } else {
            this.ctrl.items.delete(classTestItem.id);
        }
        this.testItemMap.delete(classTestItem.id);
    }

    public async initializeWorkspace() {
        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        // Clear any existing file system watchers before setting new ones
        this.clearWorkspaceFileSystemWatchers();

        // Discover relevant files in all workspace folders
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                // Get glob pattern definition for location of PHPUnit configuration files
                const configPattern = this.getLocatorPatternConfigFile(workspaceFolder);
                this.setWatchersForConfigFiles(workspaceFolder, configPattern);

                // Parse configuration file immediately (this is required to retrieve test suite definitions, in case
                // test methods are organised by suite - see below)
                await this.parseWorkspaceFolderConfigFiles(workspaceFolder, configPattern);

                // Locate test methods. Depending on settings, tests could be identified by test suites defined in
                // PHPUnit configuration files, or by a glob pattern
                const testPatterns = this.getLocatorPatternTestFiles(workspaceFolder);
                this.setWatchersForTestFiles(workspaceFolder, testPatterns);

                // Parse test files identified in the workspace folder
                await this.parseWorkspaceFolderTestFiles(workspaceFolder, testPatterns);
            })
        );
    }

    public async resetWorkspace() {
        this.clearTestControllerItems();
        this.testSuiteMap.clear();
        this.initializeWorkspace();
    }

    private getLocatorPatternConfigFile(workspaceFolder: vscode.WorkspaceFolder) {
        return new vscode.RelativePattern(workspaceFolder, this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder));
    }

    private getLocatorPatternTestFiles(workspaceFolder: vscode.WorkspaceFolder) {
        let patterns: vscode.RelativePattern[] = [];
        if (this.isUsingTestSuiteDefinitions() === true) {
            // Tests are identified by test suite definitions in the PHPUnit configuration XML file
            // for the workspace
            let suites = this.testSuiteMap.getWorkspaceTestSuites(workspaceFolder);
            for (let suite of suites) {
                let testSuffixGlob = this.getTestSuffixGlob(workspaceFolder);  // Taken from VSCode workspace settings
                patterns.push(...suite.getGlobsForTestSuiteItems(testSuffixGlob));
            }
        } else {
            // Tests are identified by a glob pattern in a target directory
            patterns.push(this.getTestLocatorPattern(workspaceFolder));
        }
        return patterns;
    }

    /***********************************************************************/
    /* Workspace file system watcher operations                            */
    /***********************************************************************/

    private setWatchersForConfigFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        pattern: vscode.RelativePattern
    ) {
        // Set watcher for new, changed or deleted PHPUnit config files within the workspace
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Add event handler to clean up test suites on config file delete
        watcher.onDidCreate(configFileUri => this.parseConfigFile(configFileUri, workspaceFolder));
        watcher.onDidChange(configFileUri => this.parseConfigFile(configFileUri, workspaceFolder));
        watcher.onDidDelete(configFileUri => this.removeConfigFile(configFileUri));
        this.watchers.push(watcher);
    }

    private setWatchersForTestFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        patterns: vscode.RelativePattern[],
        testSuite?: TestSuite
    ) {
        for (let pattern of patterns) {
            // Set watcher for new, changed or deleted test files within the workspace
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            // Set file related event handlers
            watcher.onDidCreate(testFileUri => this.parseTestFile(testFileUri, workspaceFolder, testSuite));
            watcher.onDidChange(testFileUri => this.parseTestFile(testFileUri, workspaceFolder, testSuite));
            watcher.onDidDelete(testFileUri => this.removeTestFile(testFileUri));
            this.watchers.push(watcher);
        }
    }

    public clearWorkspaceFileSystemWatchers() {
        this.watchers.map(watcher => watcher.dispose());
    }

    /***********************************************************************/
    /* Wrappers for parsing config files, text files and open documents    */
    /***********************************************************************/

    public async parseWorkspaceConfigFiles() {
        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        // Discover relevant files in all workspace folders
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                // Get glob pattern definition for location of PHPUnit configuration files
                const configPattern = this.getLocatorPatternConfigFile(workspaceFolder);
                await this.parseWorkspaceFolderConfigFiles(workspaceFolder, configPattern);
            })
        );
    }
    
    public async parseWorkspaceTestFiles() {
        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        // Discover relevant files in all workspace folders
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                // Locate test methods. Depending on settings, tests could be identified by test suites defined in
                // PHPUnit configuration files, or by a glob pattern
                const testPatterns = this.getLocatorPatternTestFiles(workspaceFolder);
                await this.parseWorkspaceFolderTestFiles(workspaceFolder, testPatterns);
            })
        );
    }

    public async parseWorkspaceFolderConfigFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        pattern: vscode.RelativePattern
    ) {
        const configFileUris = await vscode.workspace.findFiles(pattern);
        for (const configFileUri of configFileUris) {
            await this.parseConfigFile(configFileUri, workspaceFolder);
        }
    }

    public async parseWorkspaceFolderTestFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        patterns: vscode.RelativePattern[],
        testSuite?: TestSuite
    ) {
        for (const pattern of patterns) {
            const testFileUris = await vscode.workspace.findFiles(pattern);
            for (const testFileUri of testFileUris) {
                await this.parseTestFile(testFileUri, workspaceFolder, testSuite);
            }
        }
    }

    /***********************************************************************/
    /* Wrapper for opening a document of unknown type                      */
    /***********************************************************************/

    public async parseOpenDocument(document: vscode.TextDocument) {
        // Only parse files from within a workspace folder
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return;
        }

        // Check that document is in a state to be parsed (is a source code file, and is not 'dirty')
        if (this.isParsableDocument(document) !== true) {
            return;
        }

        // Check if the file is a PHPUnit configuration XML file
        const patternConfig = new vscode.RelativePattern(workspaceFolder, this.getPhpUnitConfigXmlLocatorPattern(workspaceFolder));
        if (vscode.languages.match({ pattern: patternConfig }, document) !== 0) {
            this.parseConfigDocument(document, workspaceFolder);
            this.resetWorkspace();  // Change in PHPUnit means we need to reparse test files
            return;
        }

        // If we are using test suite definitions, check the document location against directories and
        // file locations for each suite
        if (this.isUsingTestSuiteDefinitions() === true) {
            let testSuite  = this.findSuiteTestItemForTestDocument(workspaceFolder, document);
            this.parseTestDocument(document, workspaceFolder, testSuite);
        }

    }

    /***********************************************************************/
    /* Logic for parsing and removing a PHPUnit configuration file         */
    /***********************************************************************/

    public async parseConfigFile(
        fileUri: vscode.Uri,
        workspaceFolder?: vscode.WorkspaceFolder
    ) {
        let document = await vscode.workspace.openTextDocument(fileUri);
        return this.parseConfigDocument(document, workspaceFolder);
    }

    public async parseConfigDocument(
        document: vscode.TextDocument,
        workspaceFolder?: vscode.WorkspaceFolder
    ) {
        // Get the workspace folder for the document, if not provided
        if (!workspaceFolder) {
            workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                return;
            }
        }

        // Parse the config file
        this.logger.trace(`Parsing PHPUnit configuration file: ${document.uri.toString()}`);
        let testSuites = await this.configParser.parse(document.getText(), document.uri);

        // Associate test suites to the workspace folder
        this.testSuiteMap.add(workspaceFolder, testSuites);
    }

    public removeConfigFile(fileUri: vscode.Uri) {
        this.testSuiteMap.deleteConfigFileTestSuites(fileUri);
    }

    /***********************************************************************/
    /* Logic for parsing and removing a test class file                    */
    /***********************************************************************/

    public async parseTestFile(
        fileUri: vscode.Uri,
        workspaceFolder?: vscode.WorkspaceFolder,
        testSuite?: TestSuite
    ) {
        let document = await vscode.workspace.openTextDocument(fileUri);
        return this.parseTestDocument(document, workspaceFolder, testSuite);
    }

    public async parseTestDocument(
        document: vscode.TextDocument,
        workspaceFolder?: vscode.WorkspaceFolder,
        testSuite?: TestSuite | vscode.TestItem
    ) {
        // Get the workspace folder for the document, if not provided
        if (!workspaceFolder) {
            workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                return;
            }
        }

        // Assume that the parent test item is the root item in the controller
        // We will refine as we process the test file definition
        let testSuiteTestItem: vscode.TestItem | undefined = undefined;

        // Parse the test file
        this.logger.trace(`Parsing test file: ${document.uri.toString()}`);
        let testDefinitions = this.testParser.parse(document.getText(), document.uri);

        // Get the TestItem for the parent test suite (if applicable)
        if (this.isUsingTestSuiteDefinitions(workspaceFolder) === true) {
            if (testSuite) {
                if (testSuite instanceof TestSuite) {
                    // Use TestSuite definition to find the associated TestItem
                    testSuiteTestItem = this.getSuiteTestItem(testSuite);
                } else {
                    // Test suite has already been provided as a TestItem
                    testSuiteTestItem = testSuite;
                }
            } else {
                // No test suite TestItem provided - attempt to locate it now
                testSuiteTestItem = this.findSuiteTestItemForTestDocument(workspaceFolder, document);
            }

            // If no test suite has been found, then no need to parse the test file
            if (!testSuiteTestItem) {
                return;
            }
        }

        // Process each of test definitions
        let parentTestItem: vscode.TestItem | undefined = undefined;
        for (let definition of testDefinitions) {
            if (definition.getType() === ItemType.class) {
                parentTestItem = testSuiteTestItem;
                if (definition.getNamespaceName()) {
                    parentTestItem = await this.getNamespaceTestItem(workspaceFolder, definition.getNamespaceName()!, testSuiteTestItem);
                }
                parentTestItem = this.getClassTestItem(definition, parentTestItem);
            } else if (definition.getType() === ItemType.method) {
                this.getMethodTestItem(definition, parentTestItem);
            }
        }
    }

    /***********************************************************************/
    /* Helpers                                                             */
    /***********************************************************************/

    private isParsableDocument(document: vscode.TextDocument): boolean {
        // Only need to parse actual source code files (prevents parsing of URIs with git scheme, for example)
        if (document.uri.scheme !== 'file') {
            return false;
        }

        // Check whether the file is 'dirty' (i.e. Do not parse files that are actively being edited)
        if (document.isDirty === true) {
            return false;
        }

        return true;
    }

    private findSuiteTestItemForTestDocument(workspaceFolder: vscode.WorkspaceFolder, document: vscode.TextDocument): vscode.TestItem | undefined {
        // Get test suites for the workspace folder, and check if the document matches a file or directory definition
        let testSuffixGlob = this.getTestSuffixGlob(workspaceFolder);
        let testSuites = this.testSuiteMap.getWorkspaceTestSuites(workspaceFolder);
        for (let testSuite of testSuites) {
            // Set file system watcher for patterns
            let patterns = testSuite.getGlobsForTestSuiteItems(testSuffixGlob);
            for (let pattern of patterns) {
                if (vscode.languages.match({ pattern: pattern }, document) !== 0) {
                    return this.getSuiteTestItem(testSuite);
                }
            }
        }
        return undefined;
    }

    private getSuiteTestItem(suite: TestSuite) {
        let id = generateTestItemId(ItemType.testsuite, suite.getConfigFileUri(), suite.getName());
        let label = 'SUITE: ' + suite.getName();

        // Check if the test suite already exists as a child of the root item in the test controller
        let item = this.ctrl.items.get(id);
        if (item) {
            // TestItem for test suite already exists
            return item;
        }
        
        // Create new TestItem for the test suite
        item = this.ctrl.createTestItem(id, label, suite.getConfigFileUri());
        item.canResolveChildren = true;

        // Add directly to the test controller - suites will not have parent items
        this.ctrl.items.add(item);

        // Update TestItem map with the new test suite
        let definition = new TestItemDefinition(
            ItemType.testsuite,
            suite.getConfigFileUri(),
            {
                testSuiteName: suite.getName(),
                testSuiteId: id
            }
        );
        this.testItemMap.set(item, definition);
        this.logger.trace('- Created new TestItem for suite: ' + label);
        return item;
    }

    private async getNamespaceTestItem(workspaceFolder: vscode.WorkspaceFolder, namespace: string, parent?: vscode.TestItem): Promise<vscode.TestItem | undefined> {
        if (this.isOrganizedByNamespace() !== true) {
            return parent;
        }

        let namespacePrefix = this.getTestNamespacePrefix(workspaceFolder);
        let namespaceDir = workspaceFolder.uri.with({ path: workspaceFolder.uri.path + '/' + this.getTestDirectory() });

        // If the test directory has been mapped to a namespace, create a new TestItem to cover the entire prefix
        let namespaceParts: string[] = [];
        if (namespacePrefix.length > 0) {
            // Treat the prefix components as one chunk, and then subsequent components separately
            namespaceParts.push(namespacePrefix);
            namespacePrefix = namespacePrefix.replace(/\\/g, '\\'); // Fix for escaped backslashes
            namespace = namespace.replace(namespacePrefix + '\\', '');
            namespaceParts.push(...namespace.split('\\'));
        } else {
            namespaceParts = namespace.split('\\');
        }

        // Fix for #47: Check directory exists to map onto the namespace
        let targetNamespaceFolder = namespaceDir.with({ path: namespaceDir.path + '/' + namespace.replace('\\', '/')});
        try {
            let namespaceDirectoryStats = await vscode.workspace.fs.stat(targetNamespaceFolder);
        } catch (error) {
            this.logger.warn(`No directory could be found that maps to namespace '${namespace}' (Folder '${targetNamespaceFolder.fsPath}' not found.)`);
            return parent;
        }

        // Traverse namespace components and create TestItem for each
        let namespacePath = '';
        for (let namespacePart of namespaceParts) {
            // Set path and mapped directory for namespace component
            namespacePath = namespacePath + '\\' + namespacePart;
            if (namespacePart !== namespacePrefix) {
                namespaceDir = namespaceDir.with({ path: namespaceDir.path + '/' + namespacePart.replace('\\', '/') });
            }

            // Find or create TestItem for namespace component
            let id = generateTestItemId(ItemType.namespace, namespaceDir);
            let item = this.getExistingTestItem(id, parent);

            // If a TestItem does not already exist for the prefix, create it now
            if (!item) {
                // Create new TestItem for the namespace prefix
                item = this.ctrl.createTestItem(id, namespacePart, namespaceDir);
                item.canResolveChildren = true;
                this.addTestItem(item, parent);

                // Update TestItem map with the new namespace
                let definition = new TestItemDefinition(
                    ItemType.namespace,
                    namespaceDir,
                    {
                        namespaceName: namespacePath,
                        namespaceId: id
                    }
                );
                this.testItemMap.set(item, definition);
                this.logger.trace('- Created new TestItem for namespace: ' + namespacePath);
            }

            // Update parent TestItem and directory for next component
            parent = item;
        }

        return parent;
    }

    private getClassTestItem(definition: TestItemDefinition, parent?: vscode.TestItem): vscode.TestItem {
        let id = definition.getClassId()!;
        let label = definition.getClassName()!;
        if (this.isOrganizedByNamespace() !== true && definition.getNamespaceName()) {
            // Tests are not organised in a namespace tree, so label the class with the fully-qualified namespace to
            // ensure it can be identified correctly
            label = definition.getNamespaceName() + '\\' + definition.getClassName();
        }
        if (this.isOrganizedByNamespace() === true && definition.getNamespaceName() && !parent) {
            // Test are organised in a namespace tree, but the namespace for this class does not conform to PRS-4
            // guidelines. The class may still execute without error though, so label the class with the fully-qualified
            // namespace so that it can be reviewed.
            label = definition.getNamespaceName() + '\\' + definition.getClassName();
        }

        // Check if TestItem has already been created for the class
        let item = this.getExistingTestItem(id, parent);
        if (item) {
            // TestItem for class already exists
            if (parent) {
                // FIX FOR #47: If this class already exists as a child of a different parent 
                // (i.e. the namespace for the class has changed), remove it from the old parent
                let existingClassTestItem = this.testItemMap.getTestItem(id);
                if (existingClassTestItem && existingClassTestItem.parent && existingClassTestItem.parent.id !== parent.id) {
                    this.removeChildFromParentTestItem(existingClassTestItem);
                }
            }
            return item;
        }

        // Create new TestItem for the class
        item = this.ctrl.createTestItem(id, label, definition.getUri());
        item.range = definition.getRange();
        item.canResolveChildren = true;
        this.addTestItem(item, parent);

        // Update TestItem map with the new class
        this.testItemMap.set(item, definition);
        this.logger.trace('- Created new TestItem for class: ' + label);
        return item;
    }

    private getMethodTestItem(definition: TestItemDefinition, parent?: vscode.TestItem): vscode.TestItem {
        let id = definition.getMethodId()!;
        let label = definition.getMethodName()!;

        // Always create a new TestItem for test methods
        let item = this.ctrl.createTestItem(id, label, definition.getUri());
        item.range = definition.getRange();
        item.canResolveChildren = false;
        this.addTestItem(item, parent);

        // Update TestItem map with the new method
        this.testItemMap.set(item, definition);
        this.logger.trace('- Created new TestItem for method: ' + label);
        return item;
    }

    private getExistingTestItem(id: string, parent?: vscode.TestItem): vscode.TestItem | undefined {
        if (parent) {
            return parent.children.get(id);
        } 
        return this.ctrl.items.get(id);
    }

    private addTestItem(item: vscode.TestItem, parent?: vscode.TestItem) {
        // Add as a child of the parent, or directly to the test controller if there is no parent
        if (parent) {
            parent.children.add(item);
        } else {
            this.ctrl.items.add(item);
        }
    }

    private removeChildFromParentTestItem(item: vscode.TestItem) {
        // If the item has no parent, nothing else to do
        if (!item.parent) {
            return;
        }

        // Remove the item as a child from its parent
        let parent = item.parent;
        parent.children.delete(item.id);

        // If this was the last child of the parent, remove the parent as well
        if (parent.children.size <= 0) {
            this.removeChildFromParentTestItem(parent);
        }
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

    private getTestLocatorPattern(workspaceFolder: vscode.WorkspaceFolder) {
        let pattern = this.getTestDirectory(workspaceFolder) + '/**/' + this.getTestSuffixGlob(workspaceFolder);
        this.logger.trace('Using locator pattern for test file identification: ' + pattern);
        return new vscode.RelativePattern(workspaceFolder, pattern);
    }

    private getPhpUnitConfigXmlLocatorPattern(workspaceFolder?: vscode.WorkspaceFolder) {
        let pattern = this.settings.get('phpunit.locatorPatternConfigXml', 'phpunit.xml', workspaceFolder);
        this.logger.trace('Using locator pattern for configuration file identification: ' + pattern);
        return pattern;
    }

    private getTestNamespacePrefix(workspaceFolder?: vscode.WorkspaceFolder): string {
        let prefix: string = this.settings.get('phpunit.testNamespacePrefix', '', workspaceFolder);
        return prefix;
    }

    private isUsingTestSuiteDefinitions(workspaceFolder?: vscode.WorkspaceFolder): boolean {
        if (this.settings.get('phpunit.useTestSuiteDefinitions', false, workspaceFolder) === true) {
            return true;
        }
        return false;
    }

    private isOrganizedByNamespace(): boolean {
        if (this.settings.get('phpunit.testOrganization', 'file') === 'namespace') {
            return true;
        }
        return false;
    }
}