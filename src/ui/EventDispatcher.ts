import * as vscode from 'vscode';
import { TestFileLoader } from "../loader/TestFileLoader";
import { TestRunner } from "../runner/TestRunner";
import { Settings } from '../settings';

export class EventDispatcher {
    private loader: TestFileLoader;
    private runner: TestRunner;
    private settings: Settings;

    constructor(
        loader: TestFileLoader,
        runner: TestRunner,
        settings: Settings,
    ) {
        this.loader = loader;
        this.runner = runner;
        this.settings = settings;
    }

    /**
     * Request triggered by the editor to resolve test items for the entire workspace.
     */
    public async handleTestItemRefresh() {
        this.loader.resetWorkspace();
    }

    /**
     * Request triggered by the editor to resolve the supplied test item, and any children of that item.
     * 
     * If no test item is supplied by the editor, the extension should resolve test items for the entire 
     * workspace.
     * 
     * @param item TestItem to be resolved
     * @returns 
     */
    public async handleTestItemResolve(item?: vscode.TestItem) {
        if (!item) {
            // No test item means we are being asked to discover all tests for the workspace
            await this.loader.parseWorkspaceTestFiles();
            return;
        }

        // If a test item has been supplied, resolve children for that item
        try {
            if (item.uri && item.uri.scheme === 'file') {
                let document = await vscode.workspace.openTextDocument(item.uri);
                await this.loader.parseTestDocument(document);
            }
        } catch (e) { }
    }

    /**
     * Refreshes settings object with new details from updated VS Code configuration. An updated configuration
     * will also trigger a reparse of any watched test files (as setting changes may affect the way TestItem objects 
     * are discovered and/or organised)
     * 
     * @param event vscode.ConfigurationChangeEvent
     */
    public async handleChangedConfiguration(event: vscode.ConfigurationChangeEvent) {
        if (event.affectsConfiguration('phpunit-test-workbench')) {
            this.settings.refresh();
            await this.loader.resetWorkspace();
        }
    }

    /**
     * If the text file being changed is relevant to the extension (i.e. either a test file, or a PHPUnit 
     * configuration file), this event will trigger the loader to reparse the file for changes / additions
     * to TestItems within the file. 
     * 
     * If the file is within the scope of an active continuous test run, this event will also trigger a new
     * test run.
     * 
     * @param event vscode.TextDocumentChangeEvent
     */
    public async handleChangedTextDocument(event: vscode.TextDocumentChangeEvent) {
        // Only need to parse actual source code files (prevents parsing of URIs with git scheme, for example)
        let document = event.document;
        if (document.uri.scheme !== 'file') {
            return;
        }

        // Check whether the file is 'dirty' (i.e. Do not parse files that are actively being edited)
        if (document.isDirty === true) {
            return;
        }

        // Update TestItem definitions for changed document
        await this.loader.handleChangedTextDocument(document);

        // If document is within the scope of an active continuous test run, initiate a new test run now
        this.runner.checkForActiveContinuousRun(document);
    }

    /**
     * Update any TestItem definitions related to the file being renamed.
     * 
     * If the file is within the scope of an active continuous test run, remove the watcher for that
     * continuous test run.
     * 
     * @param event vscode.FileRenameEvent
     */
    public async handleRenamedFile(event: vscode.FileRenameEvent) {
        // Update TestItem definitions to use new filename
        await this.loader.handleRenamedFiles(event.files);

        // If the old filename was the entry point for an active continuous run, remove it now
        for (let {oldUri, newUri} of event.files) {
            this.runner.removeContinuousRunForDeletedFile(oldUri);
        }
    }

    /**
     * Remove any TestItem definitions related to the file being deleted.
     * 
     * If the file is within the scope of an active continuous test run, remove the watcher for that
     * continuous test run.
     * 
     * @param event vscode.FileDeleteEvent
     */
    public async handleDeletedFile(event: vscode.FileDeleteEvent) {
        // Remove TestItem definitions related to the deleted file
        await this.loader.handleDeletedFiles(event.files);

        // If the deleted file was the entry point for an active continuous run, remove it now
        for (let deletedFileUri of event.files) {
            this.runner.removeContinuousRunForDeletedFile(deletedFileUri);
        }
    }

    public async handleNewTestRunRequest(request: vscode.TestRunRequest, cancel: vscode.CancellationToken, debug: boolean = false) {
        // Check if the request is for a continuous test run
        if (!request.continuous) {
            await this.runner.run(request, cancel, debug);
            return;
        }

        // Get details of the test items included in the continuous test run
        let patterns: vscode.RelativePattern[] = [];
        if (!request.include) {
            // Continuous test run for entire workspace
            // Get locator patterns for test files in each workspace folder
            if (!vscode.workspace.workspaceFolders) {
                // Handle the case of no open folders
                return;
            }
            vscode.workspace.workspaceFolders.map(workspaceFolder => {
                patterns =  patterns.concat(this.loader.getLocatorPatternsTestFiles(workspaceFolder));
            });
        } else {
            // Get the associated URI for each included test item to determine a locator pattern
            for (let item of request.include) {
                patterns.push(...this.loader.getLocatorPatternsContinuousTestRun(item));
            }
        }

        // Notify test runner of new patterns to check against
        this.runner.addContinuousTestRunDetails(request, cancel, patterns, debug);
    }
}