// /// <reference path="../types/php-parser.d.ts" />
// import Engine from 'php-parser';
// import * as vscode from 'vscode';

// const engine = Engine.create({
//     ast: {
//         withPositions: true,
//         withSource: true
//     },
//     parser: {
//         php7: true,
//         debug: false,
//         extractDoc: true,
//         suppressErrors: true
//     },
//     lexer: {
//         all_tokens: true,
//         comment_tokens: true,
//         mode_eval: true,
//         asp_tags: true,
//         short_tags: true
//     }
// });

// export const parsePhpSource = (text: string, events: {
//     onNamespace(): void,
//     onClass(name: string, range: vscode.Range): vscode.TestItem,
//     onTestDocblock(): void,
//     onTestMethod(): void
// }) => {
//     // Parse contents here
//     const tree: any = engine.parseCode(text);
//     return parsePhpTokens(tree, events);
// };

// function parsePhpTokens(nodes: any[], events: {
//     onNamespace(): void,
//     onClass(name: string, range: vscode.Range): vscode.TestItem,
//     onTestDocblock(): void,
//     onTestMethod(): void
// }, parent?: vscode.TestItem): vscode.TestItem {
//     nodes.map((node: any) => {
//         if (node.kind === 'namespace') {
//             // Parse children to get to class definitions
//             return parsePhpTokens(node.children, events);
//         } else if (node.kind === 'class') {
//             const lineNumber = 1;
//             const characterStartPosition = 0;
//             const characterEndPosition = 15;
//             const className = 'dummy';
//             const range = new vscode.Range(
//                 new vscode.Position(lineNumber, characterStartPosition),
//                 new vscode.Position(lineNumber, characterEndPosition)
//             );
//             const thead = events.onClass(className, range);

//             // Parse body elements for methods or docblocks
//             parsePhpTokens(node.body, events, thead);
//             return thead;
//         } else if (node.kind === 'method') {

//         }
//     });
// }