import * as vscode from 'vscode';
import * as xml from 'fast-xml-parser';
import { Logger } from "../../output";
import { Settings } from "../../settings";

export class TestCoverageParser {
    private settings: Settings;
    private logger: Logger;
    private reportBasePathUri: vscode.Uri;
    private parser: xml.XMLParser;

    constructor(
        settings: Settings,
        logger: Logger,
        reportBasePathUri: vscode.Uri
    ) {
        this.settings = settings;
        this.logger = logger;
        this.reportBasePathUri = reportBasePathUri;

        // Configure XML parser
        this.parser = new xml.XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    }

    public async parseReport(testItems: Map<string, vscode.TestItem>) {
        // Open the index file for the report
        try {
            let indexXmlUri = this.reportBasePathUri.with({ path: this.reportBasePathUri.path + '/index.xml' });
            var indexXml = this.openXmlFile(indexXmlUri);
        } catch (error) {
            this.logger.error(`Unable to open test coverage report index file: ${error}`);
            return;
        }

        // Parse the index file to build up a coverage map
        await this.parseIndexFile(indexXml);
    }

    private async openXmlFile(fileUri: vscode.Uri): Promise<any>
    {
        // Open the file and extract contents
        try {
            let fileBytesArray = await vscode.workspace.fs.readFile(fileUri);
            var fileContents = fileBytesArray.toString();
        } catch (error) {
            this.logger.error(`Unable to open XML file: ${error}`);
            return;
        }
        
        // Validate the XML structure of the coverage output file
        let valid = xml.XMLValidator.validate(fileContents);
        if (valid !== true) {
            this.logger.error(`Unable to parse test coverage report file due to invalid XML: ${valid.err.msg}`);
            return;
        }

        // Parse the file and return the structured data
        return this.parser.parse(fileContents);
    }

    private async parseIndexFile(indexData: any) {
        // Check that at least one project exists in the report
        if (!indexData.phpunit?.project) {
            this.logger.warn("Test coverage report does not contain any project data");
            return;
        }

        // Parse each project
        for (let project of indexData.phpunit.project) {
            this.parseIndexProject(project);
        }
    }

    private async parseIndexProject(projectData: any) {
        // Get project path from attribute
        let path = projectData['@_source'];

        // Parse directories for the project
        for (let directory of projectData.directory) {
            this.parseIndexDirectory(directory, path);
        }
    }

    private async parseIndexDirectory(directoryData: any, parentPath: string) {
        // Get directory name from attribute
        let name = directoryData['@_name'];
        let path = parentPath + '/' + name;

        // Check if the directory has totals calculated
        if (!directoryData.totals) {
            return;
        }

        // Get directory totals, and determine if any files within the directory were tested
        let directoryTotals = this.parseTotals(directoryData.totals);
        if (directoryTotals.lines.executed === 0) {
            return;
        }

        // If the directory has subdirectories, parse them as well
        for (let subdirectory of directoryData.directory) {
            this.parseIndexDirectory(subdirectory, path);
        }

        // If the directory has source code files, parse them now
        for (let file of directoryData.file) {

        }
    }

    private async parseIndexSourceFile(fileData: any, parentPath: string) {
        // Get file name from attribute
        let name = fileData['@_name'];
        let path = parentPath + '/' + name;

        // Check if the source file has totals calculated
        if (!fileData.totals) {
            return;
        }

        // Get source file totals, and determine any tests were executed against it
        let fileTotals = this.parseTotals(fileData.totals);
        if (fileTotals.lines.executed === 0) {
            return;
        }

        // Get path to individual source file coverage report
        let detailPath = fileData['@_href'];

        // Open the detailed report file for the source file
        try {
            let detailXmlUri = this.reportBasePathUri.with({ path: this.reportBasePathUri.path + '/' + detailPath });
            var detailXml = this.openXmlFile(detailXmlUri);
        } catch (error) {
            this.logger.error(`Unable to open test coverage report detail file: ${error}`);
            return;
        }

        // Parse the detail file to build up a coverage map
        await this.parseDetailReport(detailXml, path);
    }

    private parseDetailReport(detailData: any, parentPath: string) {
        // Check that at least one file exists in the report
        if (!detailData.phpunit?.file) {
            this.logger.warn("Detailed test coverage report does not contain any file data");
            return;
        }

        // Parse each file
        for (let file of detailData.phpunit.file) {
            this.parseDetailReportFile(file, parentPath);
        }
    }

    private parseDetailReportFile(fileData: any, parentPath: string) {
        // Get file name from attribute
        let name = fileData['@_name'];
        let path = parentPath + '/' + name;

        // Check if the file has totals calculated
        if (!fileData.totals) {
            return;
        }

        // Get file totals
        let fileTotals = this.parseTotals(fileData.totals);
        if (fileData.lines.executed === 0) {
            return;
        }

        // Record file coverage metrics
        let fileUri = vscode.Uri.file(path);
        let coverage = new vscode.FileCoverage(
            fileUri,
            new vscode.TestCoverageCount(fileMetrics.statementsCovered, fileMetrics.statements),             // Statement coverage
            new vscode.TestCoverageCount(fileMetrics.conditionalsCovered / 2, fileMetrics.conditionals / 2), // Branch coverage
            new vscode.TestCoverageCount(fileMetrics.methodsCovered, fileMetrics.methods)                    // Declaration coverage
        );
    }

    private parseTotals(totalsData: any) {
        return {
            lines: {
                total: +(totalsData.lines['@_total'] ?? 0),
                comments: +(totalsData.lines['@_comments'] ?? 0),
                code: +(totalsData.lines['@_code'] ?? 0),
                executable: +(totalsData.lines['@_executable'] ?? 0),
                executed: +(totalsData.lines['@_executed'] ?? 0),
                percent: +(totalsData.lines['@_percent'] ?? 0)
            },
            methods: {
                count: +(totalsData.methods['@_count'] ?? 0),
                tested: +(totalsData.methods['@_tested'] ?? 0),
                percent: +(totalsData.methods['@_percent'] ?? 0),
            },
            functions: {
                count: +(totalsData.functions['@_count'] ?? 0),
                tested: +(totalsData.functions['@_tested'] ?? 0),
                percent: +(totalsData.functions['@_percent'] ?? 0),
            },
            classes: {
                count: +(totalsData.classes['@_count'] ?? 0),
                tested: +(totalsData.classes['@_tested'] ?? 0),
                percent: +(totalsData.classes['@_percent'] ?? 0),
            },
            traits: {
                count: +(totalsData.traits['@_count'] ?? 0),
                tested: +(totalsData.traits['@_tested'] ?? 0),
                percent: +(totalsData.traits['@_percent'] ?? 0),
            }
        };
    }
}