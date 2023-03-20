import * as vscode from 'vscode';
import { generateTestItemId } from './TestFileParser';
import { ItemType, TestItemDefinition } from './TestItemDefinition';

export class TestItemMap {
    private testDataMap: WeakMap<vscode.TestItem, TestItemDefinition>;
    private testItemMap: Map<string, vscode.TestItem>;
    private testFileMap: Map<vscode.Uri, vscode.TestItem[]>;

    constructor() {
        this.testDataMap = new WeakMap<vscode.TestItem, TestItemDefinition>();
        this.testItemMap = new Map<string, vscode.TestItem>();
        this.testFileMap = new Map<vscode.Uri, vscode.TestItem[]>();
    }

    public has(item: vscode.TestItem | string): boolean {
        let itemId: string;
        if (typeof item === 'string') {
            itemId = item;
        } else {
            itemId = item.id;
        }
        return this.testItemMap.has(itemId);
    }

    public set(item: vscode.TestItem, definition: TestItemDefinition) {
        this.testDataMap.set(item, definition);
        this.testItemMap.set(item.id, item);
        
        if (!item.uri) {
            return;
        }

        let testFileItems = this.testFileMap.get(item.uri);
        if (!testFileItems) {
            testFileItems = [];
        }
        testFileItems.push(item);
        this.testFileMap.set(item.uri, testFileItems);
    }

    public delete(item: vscode.TestItem | string) {
        let testItem: vscode.TestItem | undefined;
        if (typeof item === 'string') {
            testItem = this.getTestItem(item);
        } else {
            testItem = item;
        }
        if (!testItem) {
            return;
        }

        this.testItemMap.delete(testItem.id);
        this.testDataMap.delete(testItem);
    }

    public clear() {
        this.testItemMap.clear();
        this.testDataMap = new WeakMap<vscode.TestItem, TestItemDefinition>();
    }

    public getTestSuites(): vscode.TestItem[] {
        let testsuites: vscode.TestItem[] = [];
        for (let [key, testItem] of this.testItemMap) {
            let def = this.getTestItemDef(testItem);
            if (def && def.getType() === ItemType.testsuite) {
                testsuites.push(testItem);
            }
        }

        return testsuites;
    }

    public getTestItem(itemId: string): vscode.TestItem | undefined {
        return this.testItemMap.get(itemId);
    }

    public getTestItemForClass(uri: vscode.Uri) {
        let itemId = generateTestItemId(ItemType.class, uri);
        return this.getTestItem(itemId);
    }

    public getTestItemForMethod(uri: vscode.Uri, method: string) {
        let itemId = generateTestItemId(ItemType.method, uri, method);
        return this.getTestItem(itemId);
    }

    public getTestItemDef(item: vscode.TestItem | string): TestItemDefinition | undefined {
        let testItem: vscode.TestItem | undefined;
        if (typeof item === 'string') {
            testItem = this.getTestItem(item);
        } else {
            testItem = item;
        }
        if (!testItem) {
            return;
        }

        return this.testDataMap.get(testItem);
    }

    public getClassTestItem(uri: vscode.Uri, position: vscode.Position): vscode.TestItem | undefined {
        return this.getFileTestItem(ItemType.class, uri, position);
    }

    public getMethodTestItem(uri: vscode.Uri, position: vscode.Position): vscode.TestItem | undefined {
        return this.getFileTestItem(ItemType.method, uri, position);
    }

    private getFileTestItem(type: ItemType, uri: vscode.Uri, position: vscode.Position): vscode.TestItem | undefined {
        let uriTestItems = this.testFileMap.get(uri);
        if (!uriTestItems) {
            return;
        }

        let testItem = undefined;
        for (let item of uriTestItems) {
            let itemDef = this.getTestItemDef(item);
            if (!itemDef || itemDef.getType() !== type) {
                continue;
            }
            if (item.range && item.range.contains(position)) {
                return item;
            }
        }
    }
}
