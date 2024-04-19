import * as vscode from 'vscode';
import * as xml from 'fast-xml-parser';
import { Logger } from '../../output';

export class TestCoverageMap {

    private coverageMap: Map<vscode.FileCoverage, vscode.FileCoverageDetail[]>;
    private coverageFileUri?: vscode.Uri;
    private logger: Logger;

    constructor(
        logger: Logger
    ) {
        this.coverageMap = new Map<vscode.FileCoverage, vscode.FileCoverageDetail[]>();
        this.logger = logger;
        this.parseCoverageFile();
    }

    public async loadCoverageFile(coverageFileUri: vscode.Uri) {
        this.coverageFileUri = coverageFileUri;
        this.coverageMap.clear();
        await this.parseCoverageFile();
    }

    public getFileCoverage(): IterableIterator<vscode.FileCoverage> {
        return this.coverageMap.keys();
    }

    public getDetailedMetrics(coverage: vscode.FileCoverage): vscode.FileCoverageDetail[] {
        let metrics = this.coverageMap.get(coverage);
        if (!metrics) {
            return [];
        }
        return metrics;
    }

    private async parseCoverageFile() {
        // Open the coverage file and extract contents
        try {
            let coverageXmlArr = await vscode.workspace.fs.readFile(this.coverageFileUri!);
            var coverageXml = coverageXmlArr.toString();
        } catch (error) {
            this.logger.error(`Unable to open test coverage report file: ${error}`);
            return;
        }
        
        // Validate the XML structure of the coverage output file
        let valid = xml.XMLValidator.validate(coverageXml);
        if (valid !== true) {
            this.logger.error(`Unable to parse test coverage report file due to invalid XML: ${valid.err.msg}`);
            return;
        }

        // Start parsing
        let parser = new xml.XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
        let data = parser.parse(coverageXml);
        if (!data?.coverage?.project?.file) {
            // There was no coverage data for individual files
            this.logger.warn(`Coverage analysis does not contain any detail for individual files`);
            return;
        }

        // Get details of files
        for (let file of data.coverage.project.file) {
            // Get filename
            let filename = file['@_name'] ?? '';
            if (!filename) {
                // If there is no filename, there will be no relevant statistics to capture - move to next file in report
                continue;
            }

            // Get file metrics
            let fileMetrics = {
                linesOfCode: +file.metrics['@_loc'] ?? 0,
                linesOfCodeNonComment: +file.metrics['@_ncloc'] ?? 0,
                classes: +file.metrics['@_classes'] ?? 0,
                methods: +file.metrics['@_methods'] ?? 0,                         // Number of contained methods
                methodsCovered: +file.metrics['@_coveredmethods'] ?? 0,           // Number of contained methods with coverage
                conditionals: +file.metrics['@_conditionals'] ?? 0,               // Number of contained conditionals (2 * number of branches)
                conditionalsCovered: +file.metrics['@_coveredconditionals'] ?? 0, // Number of contained conditionals (2 * number of branches) with coverage
                statements: +file.metrics['@_statements'] ?? 0,                   // Number of contained statements
                statementsCovered: +file.metrics['@_coveredstatements'] ?? 0,     // Number of contained statements with coverage
                elements: +file.metrics['@_elements'] ?? 0,                       // Number of contained statements, conditionals and methods
                elementsCovered: +file.metrics['@_coveredelements'] ?? 0,         // Number of contained statements, conditionals and methods with coverage
            };
                
            let fileUri = vscode.Uri.file(filename);
            let coverage = new vscode.FileCoverage(
                fileUri,
                new vscode.TestCoverageCount(fileMetrics.statementsCovered, fileMetrics.statements),             // Statement coverage
                new vscode.TestCoverageCount(fileMetrics.conditionalsCovered / 2, fileMetrics.conditionals / 2), // Branch coverage
                new vscode.TestCoverageCount(fileMetrics.methodsCovered, fileMetrics.methods)                    // Declaration coverage
            );

            // If the file does not contain any line-detail metrics, move to next file
            if (!file.line) {
                continue;
            }

            // Get detailed metrics for file
            let detailedMetrics: vscode.FileCoverageDetail[] = [];
            if (file.line?.[Symbol.iterator]) {
                for (let line of file.line) {
                    let coverageDetail = this.processLine(line);
                    if (coverageDetail) {
                        detailedMetrics.push(coverageDetail);
                    }
                }
            } else if (file.line) {
                let coverageDetail = this.processLine(file.line);
                if (coverageDetail) {
                    detailedMetrics.push(coverageDetail);
                }
            }
            
            // Add detailed metrics to map
            this.coverageMap.set(coverage, detailedMetrics);
        }
    }

    private processLine(line: any): vscode.FileCoverageDetail | undefined {
        if (line['@_type'] === 'stmt') {
            return new vscode.StatementCoverage(
                +line['@_count'] ?? 0,
                new vscode.Position((+line['@_num'] - 1), 0)
            );
        } else if (line['@_type'] === 'method') {
            return new vscode.DeclarationCoverage(
                line['@_name'],
                +line['@_count'] ?? 0,
                new vscode.Position((+line['@_num'] - 1), 0)
            );                  
        }
        return;
    }
}