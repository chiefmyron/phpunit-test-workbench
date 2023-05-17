import * as vscode from 'vscode';
import { ItemType, TestItemDefinition } from './TestItemDefinition';
import { TestTagCreatedEvent } from './events/TestTagCreatedEvent';
import { TestTagRemovedEvent } from './events/TestTagCreatedRemoved';

export class TestItemMap {
    private testItemMap: Map<string, vscode.TestItem>;
    private testDefinitionMap: Map<string, TestItemDefinition>;
    private testSuiteList: vscode.TestItem[];
    private testFileMap: Map<vscode.Uri, string[]>;
    private testTagMap: Map<string, vscode.TestItem[]>;

    private _onTestTagCreated: vscode.EventEmitter<TestTagCreatedEvent>;
    private _onTestTagRemoved: vscode.EventEmitter<TestTagRemovedEvent>;

    constructor() {
        this.testItemMap = new Map<string, vscode.TestItem>();
        this.testDefinitionMap = new Map<string, TestItemDefinition>();
        this.testSuiteList = [];
        this.testFileMap = new Map<vscode.Uri, string[]>();
        this.testTagMap = new Map<string, vscode.TestItem[]>();

        this._onTestTagCreated = new vscode.EventEmitter<TestTagCreatedEvent>();
        this._onTestTagRemoved = new vscode.EventEmitter<TestTagRemovedEvent>();
    }

    public has(id: string): boolean {
        return this.testItemMap.has(id);
    }

    public set(item: vscode.TestItem, definition: TestItemDefinition): void {
        // Add TestItem to item and definition maps
        this.testItemMap.set(item.id, item);
        this.testDefinitionMap.set(item.id, definition);

        // Check if the TestItem needs to be added to the file map
        if (!item.uri) {
            return; // TestItem does not have a URI (e.g. a Test Suite)
        }

        // Add TestItem to the file map
        this.addItemToFileMap(item);

        // Set tags for the TestItem
        this.setItemTestTags(item, definition.getTestTags());

        // If this is a test suite, add it to the list
        if (definition.getType() === ItemType.testsuite) {
            this.testSuiteList.push(item);
        }
    }

    public delete(id: string): void {
        // Get the TestItem from the map
        let item = this.getTestItem(id);
        let definition = this.getTestDefinition(id);
        if (!item || !definition) {
            return;
        }

        // Remove TestItem from the file and tag maps
        this.removeItemFromFileMap(item);
        this.removeItemFromTagMap(item);

        // If this is a test suite, remove it from the list
        if (definition.getType() === ItemType.testsuite) {
            this.testSuiteList.splice(this.testSuiteList.indexOf(item), 1);
        }

        // Remove TestItem from item and definition maps
        this.testItemMap.delete(id);
        this.testDefinitionMap.delete(id);
    }

    public clear(): void {
        this.testItemMap.clear();
        this.testDefinitionMap.clear();
        this.testFileMap.clear();
        this.testSuiteList = [];
        this.testTagMap.forEach((tests, tag) => this._onTestTagRemoved.fire(new TestTagRemovedEvent(tag)));
        this.testTagMap.clear();
    }

    public getTestItem(id: string): vscode.TestItem | undefined {
        return this.testItemMap.get(id);
    }

    public getTestDefinition(id: string): TestItemDefinition | undefined {
        return this.testDefinitionMap.get(id);
    }

    public getTestItemForFilePosition(uri: vscode.Uri, position: vscode.Position, type: ItemType): vscode.TestItem | undefined {
        // Check if any test items exist for the file and match against the supplied position and type
        let fileTestItems = this.getTestItemsForFile(uri, type);
        for (let item of fileTestItems) {
            if (item.range && item.range.contains(position) === true) {
                return item;
            }
        };
    }

    public getTestItemsForFile(uri: vscode.Uri, type?: ItemType): vscode.TestItem[] {
        let testItems: vscode.TestItem[] = [];
        this.testFileMap.get(uri)?.forEach(itemId => {
            // Get TestItem for the ID
            let testItem = this.getTestItem(itemId);
            if (!testItem) {
                return;
            }

            if (type && itemId.startsWith(type) === true) {
                testItems.push(testItem);
            } else if (!type) {
                testItems.push(testItem);
            }
        });
        return testItems;
    }

    public getTestItemsForTag(tag: vscode.TestTag): vscode.TestItem[] {
        let testItems = this.testTagMap.get(tag.id);
        if (!testItems) {
            return [];
        }
        return testItems;
    }

    public getTestItemsForSuites(): vscode.TestItem[] {
        return this.testSuiteList;
    }

    public getTestItemIdsForFile(uri: vscode.Uri, type?: ItemType): string[] {
        let testItemIds: string[] = [];
        this.testFileMap.get(uri)?.forEach(itemId => {
            if (type && itemId.startsWith(type) === true) {
                testItemIds.push(itemId);
            } else if (!type) {
                testItemIds.push(itemId);
            }
        });
        return testItemIds;
    }

    public getTagIds(): string[] {
        let tags: string[] = [];
        this.testTagMap.forEach((items, tagId) => {
            tags.push(tagId);
        });
        return tags;
    }

    /***********************************************************************
     * HELPERS - File map                                                  *
     ***********************************************************************/
    private addItemToFileMap(item: vscode.TestItem): void {
        if (!item.uri) {
            return;
        }

        let fileTestItems = this.testFileMap.get(item.uri);
        if (!fileTestItems) {
            fileTestItems = [];
        }
        if (fileTestItems.indexOf(item.id) <= -1) {
            fileTestItems.push(item.id);
        }
        this.testFileMap.set(item.uri, fileTestItems);
    }

    private removeItemFromFileMap(item: vscode.TestItem): void {
        if (!item.uri) {
            return;
        }

        let fileTestItems = this.getTestItemIdsForFile(item.uri);
        fileTestItems.splice(fileTestItems.indexOf(item.id), 1);
        this.testFileMap.set(item.uri, fileTestItems);
    }

    /***********************************************************************
     * HELPERS - Tag map                                                   *
     ***********************************************************************/

    private setItemTestTags(item: vscode.TestItem, tags: vscode.TestTag[]) {
        // Remove the TestItem from any existing tags in the reverse map
        this.removeItemFromTagMap(item);

        // Populate tags from supplied array
        item.tags = [];
        for (let tag of tags) {
            // Add tag to TestItem
            item.tags = [...item.tags, tag];

            // Add TestItem to the reverse map of tags (allows lookup of 
            // TestItems by tag)
            this.addItemToTagMap(item, tag);
        }
    }

    private addItemToTagMap(item: vscode.TestItem, tag: vscode.TestTag): void {
        let tagTestItems = this.testTagMap.get(tag.id);
        if (!tagTestItems) {
            // Initialise list of test items for the new tag
            tagTestItems = [];

            // Fire event for new tag
            this._onTestTagCreated.fire(
                new TestTagCreatedEvent(tag.id)
            );
        }
        tagTestItems.push(item);
        this.testTagMap.set(tag.id, tagTestItems);
    }

    private removeItemFromTagMap(item: vscode.TestItem): void {
        this.testTagMap.forEach((taggedTestItems, tagId) => {
            // Remove from the list of test items for this tag (if it is present)
            let itemIdx = taggedTestItems.indexOf(item);
            if (itemIdx > -1) {
                taggedTestItems.splice(itemIdx, 1);
            }
            this.testTagMap.set(tagId, taggedTestItems);

            // If there are no test items remaining for the tag, remove the run profile for the tag
            if (taggedTestItems.length <= 0) {
                this.testTagMap.delete(tagId);
                this._onTestTagRemoved.fire(
                    new TestTagRemovedEvent(tagId)
                );
            }
        });
    }

    /***********************************************************************
     * EVENTS - Creation / removal of TestTags                             *
     ***********************************************************************/

    get onTestTagCreated(): vscode.Event<TestTagCreatedEvent> {
        return this._onTestTagCreated.event;
    }

    get onTestTagRemoved(): vscode.Event<TestTagRemovedEvent> {
        return this._onTestTagRemoved.event;
    }
}