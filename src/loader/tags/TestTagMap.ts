import * as vscode from 'vscode';
import { TestRunner } from '../../runner/TestRunner';

export class TestTagMap {
    private ctrl: vscode.TestController;
    private runner: TestRunner;
    private tagTestItems: Map<string, vscode.TestItem[]>;
    private tagTestRunProfile: Map<string, vscode.TestRunProfile>;

    constructor(ctrl: vscode.TestController, runner: TestRunner) {
        this.ctrl = ctrl;
        this.runner = runner;
        this.tagTestItems = new Map<string, vscode.TestItem[]>();
        this.tagTestRunProfile = new Map<string, vscode.TestRunProfile>();
    }

    public mapTestItemTags(item: vscode.TestItem, tags: string[]) {
        // If a tag has been removed, update the test item map
        this.tagTestItems.forEach((tagTestList, tagId) => {
            if (tagTestList.includes(item) === true && tags.includes(tagId) !== true) {
                tagTestList.splice(tagTestList.indexOf(item));
                if (tagTestList.length <= 0) {
                    // No TestItems left with this tag - remove the run profile
                    this.removeTestRunProfile(tagId);
                }
            }
        });

        // Relate the test item to each tag
        for (let tagId of tags) {
            let tag = new vscode.TestTag(tagId);
            let taggedTestItems = this.tagTestItems.get(tagId);
            if (!taggedTestItems) {
                // This is a new tag - add to map and include the test item
                this.tagTestItems.set(tagId, [item]);

                // We also need to create a test run profile for the new tag
                let profile = this.ctrl.createRunProfile(
                    'TAG: '+ tagId,
                    vscode.TestRunProfileKind.Run,
                    (request, token) => { this.runner.run(request, token, false); },
		            false,
		            tag
                );
                this.tagTestRunProfile.set(tagId, profile);
            } else if (taggedTestItems && taggedTestItems.includes(item) !== true) {
                // Tag already exists but test is not associated
                taggedTestItems.push(item);
            }

            // Add tag to TestItem
            item.tags = [...item.tags, tag];
        }
    }

    public clear() {
        this.tagTestItems.clear();
        this.tagTestRunProfile.forEach((profile, tag) => {
            profile.dispose();
        });
        this.tagTestRunProfile.clear();
    }

    private removeTestRunProfile(tagId: string) {
        let profile = this.tagTestRunProfile.get(tagId);
        if (profile) {
            profile.dispose();
        }
        this.tagTestRunProfile.delete(tagId);
    }    
}
