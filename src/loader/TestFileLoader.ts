import * as vscode from 'vscode';
import { Settings } from '../settings';
import { Logger } from '../output';
import { generateTestItemId, TestFileParser } from './tests/TestFileParser';
import { ItemType, TestItemDefinition } from './tests/TestItemDefinition';
import { TestItemMap } from './tests/TestItemMap';
import { TestSuiteMap } from './suites/TestSuiteMap';
import { TestSuite } from './suites/TestSuite';
import { ConfigFileParser } from './configs/ConfigFileParser';
import { NamespaceMap } from './composer/NamespaceMap';
import { ComposerFileParser } from './composer/ComposerFileParser';
import { AutoloaderDefinition } from './composer/AutoloaderDefinition';

export class TestFileLoader {
    private ctrl: vscode.TestController;
    private testItemMap: TestItemMap;
    private testSuiteMap: TestSuiteMap;
    private namespaceMap: NamespaceMap;
    private settings: Settings;
    private logger: Logger;
    private watchers: vscode.FileSystemWatcher[];
    private configParser: ConfigFileParser;
    private composerParser: ComposerFileParser;
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
        this.composerParser = new ComposerFileParser(settings, logger);
        this.testParser = new TestFileParser(settings, logger);
        this.namespaceMap = new NamespaceMap();
    }

    /***********************************************************************/
    /* Test controller operations                                          */
    /***********************************************************************/

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
                // If settings for the workspace have a PSR-4 namespace prefix defined, add it to the namespace map
                const namespacePrefix = this.settings.getTestNamespacePrefix(workspaceFolder);
                if (namespacePrefix) {
                    let namespaceDefinition = new AutoloaderDefinition(workspaceFolder, namespacePrefix, this.settings.getTestDirectory(workspaceFolder));
                    this.namespaceMap.add(workspaceFolder, [namespaceDefinition]);
                }

                // Locate PHPUnit configuration files
                const configPattern = this.getLocatorPatternConfigFile(workspaceFolder);
                this.setWatchersForConfigFiles(workspaceFolder, configPattern);

                // Parse configuration file immediately (this is required to retrieve test suite definitions, in case
                // test methods are organised by suite - see below)
                await this.parseWorkspaceFolderConfigFiles(workspaceFolder, configPattern);

                // Locate composer.json file
                const composerPattern = this.getLocatorPatternComposerFile(workspaceFolder);
                this.setWatchersForComposerFiles(workspaceFolder, composerPattern);

                // Parse composer.json file immediately (this is required in case any PSR-4 namespaces have been mapped 
                // to custom directories for the autoloader)
                await this.parseWorkspaceFolderComposerFiles(workspaceFolder, composerPattern);

                // Locate test methods. Depending on settings, tests could be identified by test suites defined in
                // PHPUnit configuration files, or by a glob pattern
                const testPatterns = this.getLocatorPatternsTestFiles(workspaceFolder);
                this.setWatchersForTestFiles(workspaceFolder, testPatterns);

                // Parse test files identified in the workspace folder
                await this.parseWorkspaceFolderTestFiles(workspaceFolder, testPatterns);
            })
        );
    }

    public async resetWorkspace() {
        this.logger.trace('[File Loader] Reset workspace');

        // Clear test items from controller, and reset the test item map
        this.ctrl.items.forEach(item => this.ctrl.items.delete(item.id));
        this.testItemMap.clear();
        this.namespaceMap.clear();

        // Re-initialise the workspace
        this.initializeWorkspace();
    }

    /***********************************************************************/
    /* Workspace file locator patterns for Composer, config and test files */
    /***********************************************************************/

    private getLocatorPatternComposerFile(workspaceFolder: vscode.WorkspaceFolder): vscode.RelativePattern {
        let pattern = this.settings.getComposerJsonLocatorPattern(workspaceFolder);
        this.logger.trace(`Using locator pattern for Composer file identification: ${pattern.pattern}`);
        return pattern;
    }

    private getLocatorPatternConfigFile(workspaceFolder: vscode.WorkspaceFolder): vscode.RelativePattern {
        let pattern = this.settings.getPhpUnitConfigXmlLocatorPattern(workspaceFolder);
        this.logger.trace(`Using locator pattern for configuration file identification: ${pattern.pattern}`);
        return pattern;
    }

    private getLocatorPatternsTestFiles(workspaceFolder: vscode.WorkspaceFolder): vscode.RelativePattern[] {
        let patterns: vscode.RelativePattern[] = [];
        if (this.settings.isUsingTestSuiteDefinitions() === true) {
            // Tests are identified by test suite definitions in the PHPUnit configuration XML file
            // for the workspace
            let suites = this.testSuiteMap.getWorkspaceTestSuites(workspaceFolder);
            for (let suite of suites) {
                let testSuffixGlob = this.settings.getTestSuffixGlob(workspaceFolder);  // Taken from VSCode workspace settings
                patterns.push(...suite.getGlobsForTestSuiteItems(testSuffixGlob));
            }
        } else {
            // Tests are identified by a glob pattern in a target directory
            let pattern = this.settings.getTestLocatorPattern(workspaceFolder);
            this.logger.trace('Using locator pattern for test file identification: ' + pattern.pattern);
            patterns.push(pattern);
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

    private setWatchersForComposerFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        pattern: vscode.RelativePattern
    ) {
        // Set watcher for new, changed or deleted composer.json files within the workspace
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Add event handler to clean up test suites on config file delete
        watcher.onDidCreate(configFileUri => this.parseComposerFile(configFileUri, workspaceFolder));
        watcher.onDidChange(configFileUri => this.parseComposerFile(configFileUri, workspaceFolder));
        watcher.onDidDelete(configFileUri => this.removeComposerFile(configFileUri));
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
        this.logger.trace('[File Loader] Parse workspace configuration files');

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

    public async parseWorkspaceComposerFiles() {
        this.logger.trace('[File Loader] Parse workspace Composer files');

        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        // Discover relevant files in all workspace folders
        vscode.workspace.workspaceFolders.map(async workspaceFolder => {
            // Get glob pattern definition for location of composer.json files
            const composerPattern = this.getLocatorPatternComposerFile(workspaceFolder);
            await this.parseWorkspaceFolderComposerFiles(workspaceFolder, composerPattern);
        });
    }
    
    public async parseWorkspaceTestFiles() {
        this.logger.trace('[File Loader] Parse workspace test files');

        // Handle the case of no open folders
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        // Discover relevant files in all workspace folders
        return Promise.all(
            vscode.workspace.workspaceFolders.map(async workspaceFolder => {
                // Locate test methods. Depending on settings, tests could be identified by test suites defined in
                // PHPUnit configuration files, or by a glob pattern
                const testPatterns = this.getLocatorPatternsTestFiles(workspaceFolder);
                await this.parseWorkspaceFolderTestFiles(workspaceFolder, testPatterns);
            })
        );
    }

    public async parseWorkspaceFolderConfigFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        pattern: vscode.RelativePattern
    ) {
        this.logger.trace('[File Loader] Parse workspace folder configuration files');

        const configFileUris = await vscode.workspace.findFiles(pattern);
        for (const configFileUri of configFileUris) {
            await this.parseConfigFile(configFileUri, workspaceFolder);
        }
    }

    public async parseWorkspaceFolderComposerFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        pattern: vscode.RelativePattern
    ) {
        this.logger.trace('[File Loader] Parse workspace folder Composer files');

        const composerFileUris = await vscode.workspace.findFiles(pattern);
        for (const composerFileUri of composerFileUris) {
            await this.parseComposerFile(composerFileUri, workspaceFolder);
        }
    }

    public async parseWorkspaceFolderTestFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        patterns: vscode.RelativePattern[],
        testSuite?: TestSuite
    ) {
        this.logger.trace('[File Loader] Parse workspace folder test files');

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
        const patternConfig = this.getLocatorPatternConfigFile(workspaceFolder);
        if (vscode.languages.match({ pattern: patternConfig }, document) !== 0) {
            this.parseConfigDocument(document, workspaceFolder);
            this.resetWorkspace();  // Change in PHPUnit means we need to reparse test files
            return;
        }

        // Check if the file is a composer.json file
        const patternComposer = this.getLocatorPatternComposerFile(workspaceFolder);
        if (vscode.languages.match({ pattern: patternComposer }, document) !== 0) {
            this.parseComposerDocument(document, workspaceFolder);
            this.resetWorkspace(); // Change in composer.json means we need to reparse test files
            return;
        }

        // If we are using test suite definitions, check the document location against directories and
        // file locations for each suite
        if (this.settings.isUsingTestSuiteDefinitions() === true) {
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
        this.logger.trace(`[File Loader] Parse configuration file (URI: ${fileUri.path})`);

        let document = await vscode.workspace.openTextDocument(fileUri);
        return this.parseConfigDocument(document, workspaceFolder);
    }

    public async parseConfigDocument(
        document: vscode.TextDocument,
        workspaceFolder?: vscode.WorkspaceFolder
    ) {
        this.logger.trace(`[File Loader] Parse configuration document (URI: ${document.uri.path})`);

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
        this.logger.trace(`[File Loader] Remove configuration file (URI: ${fileUri.path})`);
        this.testSuiteMap.deleteConfigFileTestSuites(fileUri);
    }

    /***********************************************************************/
    /* Logic for parsing and removing a composer.json file                 */
    /***********************************************************************/

    public async parseComposerFile(
        fileUri: vscode.Uri,
        workspaceFolder?: vscode.WorkspaceFolder
    ) {
        this.logger.trace(`[File Loader] Parse Composer file (URI: ${fileUri.path})`);

        let document = await vscode.workspace.openTextDocument(fileUri);
        return this.parseComposerDocument(document, workspaceFolder);
    }

    public async parseComposerDocument(
        document: vscode.TextDocument,
        workspaceFolder?: vscode.WorkspaceFolder
    ) {
        this.logger.trace(`[File Loader] Parse Composer document (URI: ${document.uri.path})`);

        // Get the workspace folder for the document, if not provided
        if (!workspaceFolder) {
            workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                return;
            }
        }

        // Parse the config file
        this.logger.trace(`Parsing composer.json file: ${document.uri.toString()}`);
        let namespaceDefinitions = await this.composerParser.parse(document.getText(), document.uri, workspaceFolder);

        // Associate namespace definitions to the workspace folder
        this.namespaceMap.add(workspaceFolder, namespaceDefinitions);
    }

    public removeComposerFile(fileUri: vscode.Uri) {
        this.logger.trace(`[File Loader] Remove composer file (URI: ${fileUri.path})`);
        this.namespaceMap.deleteComposerFileNamespaces(fileUri);
    }

    /***********************************************************************/
    /* Logic for parsing and removing a test class file                    */
    /***********************************************************************/

    public removeTestFile(fileUri: vscode.Uri) {
        this.logger.trace(`[File Loader] Remove test file (URI: ${fileUri.path})`);

        // Find any test items assocaited with the file
        let fileTestItems = this.testItemMap.getTestItemsForFile(fileUri);
        fileTestItems.forEach(item => {
            this.removeTestItem(item);
        });
    }
    
    public async parseTestFile(
        fileUri: vscode.Uri,
        workspaceFolder?: vscode.WorkspaceFolder,
        testSuite?: TestSuite
    ) {
        this.logger.trace(`[File Loader] Parse test file (URI: ${fileUri.path})`);

        let document = await vscode.workspace.openTextDocument(fileUri);
        return this.parseTestDocument(document, workspaceFolder, testSuite);
    }

    public async parseTestDocument(
        document: vscode.TextDocument,
        workspaceFolder?: vscode.WorkspaceFolder,
        testSuite?: TestSuite | vscode.TestItem
    ) {
        this.logger.trace(`[File Loader] Parse test document (URI: ${document.uri.path})`);

        // Get the workspace folder for the document, if not provided
        if (!workspaceFolder) {
            workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                return;
            }
        }

        // Get the set of IDs for any test items that already exist for this file
        let existingTestItems = this.testItemMap.getTestItemIdsForFile(document.uri);

        // Assume that the parent test item is the root item in the controller
        // We will refine as we process the test file definition
        let testSuiteTestItem: vscode.TestItem | undefined = undefined;

        // Parse the test file
        this.logger.trace(`Parsing test file: ${document.uri.toString()}`);
        let testDefinitions = this.testParser.parse(document.getText(), document.uri);

        // Get the TestItem for the parent test suite (if applicable)
        if (this.settings.isUsingTestSuiteDefinitions(workspaceFolder) === true) {
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
            let existingItemIdx = -1;
            if (definition.getType() === ItemType.class) {
                parentTestItem = testSuiteTestItem;
                if (definition.getNamespaceName()) {
                    parentTestItem = await this.getNamespaceTestItem(workspaceFolder, definition, testSuiteTestItem);
                }
                parentTestItem = this.getClassTestItem(definition, parentTestItem);
                existingItemIdx = existingTestItems.indexOf(parentTestItem.id);
            } else if (definition.getType() === ItemType.method) {
                let methodTestItem = this.getMethodTestItem(definition, parentTestItem);
                existingItemIdx = existingTestItems.indexOf(methodTestItem.id);
            }

            if (existingItemIdx > -1) {
                existingTestItems.splice(existingItemIdx, 1);
            }
        }

        // Clean up any orphaned test items
        for (let existingTestItemId of existingTestItems) {
            let existingTestItem = this.testItemMap.getTestItem(existingTestItemId);
            if (existingTestItem) {
                this.removeTestItem(existingTestItem);
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
        let testSuffixGlob = this.settings.getTestSuffixGlob(workspaceFolder);
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
        let label = `SUITE: ${suite.getName()}`;

        // Check if the test suite already exists as a child of the root item in the test controller
        let item = this.getExistingTestItem(id);
        if (item) {
            return item;
        }

        // Create definition for the new test suite
        let definition = new TestItemDefinition(
            ItemType.testsuite,
            suite.getConfigFileUri(),
            {
                testSuiteName: suite.getName(),
                testSuiteLabel: label,
                testSuiteId: id
            }
        );

        // Register the TestItem
        item = this.addTestItem(id, label, definition, suite.getConfigFileUri());
        item.canResolveChildren = true;
        this.logger.trace('- Created new TestItem for suite: ' + label);
        return item;
    }

    private async getNamespaceTestItem(workspaceFolder: vscode.WorkspaceFolder, classDefinition: TestItemDefinition, parent?: vscode.TestItem): Promise<vscode.TestItem | undefined> {
        // If tests are not being organised by namespace, no need to go further
        if (this.settings.isOrganizedByNamespace() !== true) {
            return parent;
        }

        // If the class is not associated with a namespace, no need to go further
        let classNamespace = classDefinition.getNamespaceName();
        if (!classNamespace) {
            return parent;
        }

        // Find the correct namespace prefix from the namespace map
        let namespacePrefix = '';
        let namespacePrefixPath = '';
        for (let mappedNamespace of this.namespaceMap.getWorkspaceNamespaceMap(workspaceFolder)) {
            // If the class namespace doesn't start with the mapped namespace, it is not the prefix
            if (classNamespace.startsWith(mappedNamespace.getNamespace()) !== true) {
                continue;
            }

            // If the path to the class doesn't start with the path to the mapped namespace, it is not the prefix
            if (classDefinition.getUri().path.startsWith(mappedNamespace.getDirectoryUri().path) !== true)  {
                continue;
            }

            // If we reach this point, then the mapped namespace is acting as a namespace prefix for the class
            namespacePrefix = mappedNamespace.getNamespace();
            if (namespacePrefix.endsWith('\\') === true) {
                namespacePrefix = namespacePrefix.slice(0, -1); // Remove trailing namespace path separator
            }
            namespacePrefixPath = mappedNamespace.getDirectoryUri().path;
            if (namespacePrefixPath.endsWith('/') === true) {
                namespacePrefixPath = namespacePrefixPath.slice(0, -1); // Remove trailing directory separator
            }
            break;
        }

        // If no namespace prefix was found, then class will need to live underneath the parent TestItem
        if (namespacePrefix.length <= 0) {
            this.logger.warn(`Unable to find a valid file path for namespace '${classNamespace}'.`);
            return parent;
        }

        // Build an array of namespace component parts for the class namespace. The prefix is considered as 
        // a single component.
        let namespaceParts: string[] = [];
        namespaceParts.push(namespacePrefix);

        // Remove the prefix from the class namespace, and split into its constituent parts
        let normalisedClassNamespace = classNamespace.replace(namespacePrefix + '\\', '');
        namespaceParts.push(...normalisedClassNamespace.split('\\'));

        // Verify that the target namespace directory exists
        let targetNamespaceUri = workspaceFolder.uri.with({ path: namespacePrefixPath + '/' + normalisedClassNamespace.replace(/\\/g, '/')});
        try {
            let namespaceFolderStats = await vscode.workspace.fs.stat(targetNamespaceUri);
        } catch (error: any) {
            this.logger.warn(`Directory not found for namespace '${classNamespace}' (Directory should be: ${targetNamespaceUri.fsPath})`);
            if (error instanceof vscode.FileSystemError) {
                this.logger.trace(error.message);
            }
            return parent;
        }

        // Traverse namespace component parts, and create a TestItem for each (if one doesn't already exist)
        let namespacePath = '';
        let namespaceName = '';
        for (let namespacePart of namespaceParts) {
            // Set directory path for the namespace component part
            if (namespacePath.length <= 0) {
                // This is the namespace prefix part
                namespacePath = namespacePrefixPath;
                namespaceName = namespacePrefix;
            } else {
                namespacePath = namespacePath + '/' + namespacePart;
                namespaceName = namespaceName + '\\' + namespacePart;
            }
            let namespacePartUri = workspaceFolder.uri.with({ path: namespacePath });

            // Find or create TestItem for namespace component part
            let id = generateTestItemId(ItemType.namespace, namespacePartUri);
            let item = this.getExistingTestItem(id, parent);

            // If a TestItem does not already exist for the prefix, create it now
            if (!item) {
                // Create definition for the new namespace element
                let definition = new TestItemDefinition(
                    ItemType.namespace,
                    namespacePartUri,
                    {
                        namespaceName: namespaceName,
                        namespaceId: id
                    }
                );

                // Register the test item
                item = this.addTestItem(id, namespacePart, definition, namespacePartUri, parent);
                item.canResolveChildren = true;
                this.logger.trace('- Created new TestItem for namespace: ' + namespaceName);
            }

            // Update parent TestItem and directory for next component
            parent = item;
        }

        return parent;
    }

    private getClassTestItem(definition: TestItemDefinition, parent?: vscode.TestItem): vscode.TestItem {
        let id = definition.getClassId()!;
        let name = definition.getClassName()!;
        let label = definition.getClassLabel()!;
        if (this.settings.isOrganizedByNamespace() !== true && definition.getNamespaceName() && name === label) {
            // Tests are not organised in a namespace tree, so label the class with the fully-qualified namespace to
            // ensure it can be identified correctly
            label = definition.getNamespaceName() + '\\' + definition.getClassName();
        }
        if (this.settings.isOrganizedByNamespace() === true && definition.getNamespaceName() && !parent) {
            // Test are organised in a namespace tree, but the namespace for this class does not conform to PSR-4
            // guidelines. The class may still execute without error though, so label the class with the fully-qualified
            // namespace so that it can be reviewed.
            label = definition.getNamespaceName() + '\\' + definition.getClassName();
        }

        // Check if TestItem has already been created for the class
        let item = this.getExistingTestItem(id, parent);
        if (item) {
            this.logger.trace('- Existing TestItem found for class: ' + label);

            // Always update the label, in case it has been modified
            item.label = label;
            if (parent) {
                // FIX FOR #47: If this class already exists as a child of a different parent 
                // (i.e. the namespace for the class has changed), remove it from the old parent
                let existingClassTestItem = this.testItemMap.getTestItem(id);
                if (existingClassTestItem && existingClassTestItem.parent && existingClassTestItem.parent.id !== parent.id) {
                    this.removeTestItem(existingClassTestItem);
                }
            }
            return item;
        }

        // Create new TestItem for the class
        item = this.addTestItem(id, label, definition, definition.getUri(), parent);
        item.range = definition.getRange();
        item.canResolveChildren = true;
        this.logger.trace('- Created new TestItem for class: ' + label);
        return item;
    }

    private getMethodTestItem(definition: TestItemDefinition, parent?: vscode.TestItem): vscode.TestItem {
        let id = definition.getMethodId()!;
        let label = definition.getMethodLabel()!;

        // Check if TestItem has already been created for the method
        let item = this.getExistingTestItem(id, parent);
        if (item) {
            this.logger.trace('- Existing TestItem found for method: ' + label);

            // Update label and definition
            item.label = label;
            this.testItemMap.set(item, definition);
            return item;
        }

        // Create new TestItem for the method
        item = this.addTestItem(id, label, definition, definition.getUri(), parent);
        item.range = definition.getRange();
        item.canResolveChildren = false;
        this.logger.trace('- Created new TestItem for method: ' + label);
        return item;
    }

    private getExistingTestItem(id: string, parent?: vscode.TestItem): vscode.TestItem | undefined {
        if (parent) {
            return parent.children.get(id);
        } 
        return this.ctrl.items.get(id);
    }

    private addTestItem(
        id: string,
        label: string,
        definition: TestItemDefinition,
        uri: vscode.Uri,
        parent?: vscode.TestItem
    ): vscode.TestItem {
        // Create the TestItem and register with the TestItem map
        let item = this.ctrl.createTestItem(id, label, uri);
        this.testItemMap.set(item, definition);

        // Attach as a child of the parent, or directly to the test controller 
        if (parent) {
            parent.children.add(item);
        } else {
            this.ctrl.items.add(item);
        }
        return item;
    }

    private removeTestItem(item: vscode.TestItem) {
        this.logger.trace(`Removing test item ${item.id}`);

        // Always remove the test item definition
        this.testItemMap.delete(item.id);

        // If the item has no parent, remove directly from the test controller
        if (!item.parent) {
            this.ctrl.items.delete(item.id);
            return;
        }

        // Remove the item as a child from its parent
        let parent = item.parent;
        parent.children.delete(item.id);
        if (parent.children.size <= 0) {
            // If this was the last child of the parent, remove the parent as well
            this.removeTestItem(parent);
        }
    }
}