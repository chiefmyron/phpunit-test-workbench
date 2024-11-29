# PHPUnit Test Workbench

An extension to integrate PHPUnit with the native Test Explorer functionality within VS Code. Zero configuration required for common environment setups (i.e. where `php` is in your environment path, and PHPUnit is installed via Composer or included as a PHAR library).

![Overview animation](docs/images/overview.gif)

## Features
* Integrates with standard VS Code Test Explorer
* Organise and run your tests:
  * By namespace
  * By test suite (as defined in your `phpunit.xml` configuration file)
  * Simple list of files and methods
* Filter and run your tests by test group annotations or attributes
* Errors appear as a peek within the editor
* History of test run results and execution times is maintained
* Includes commands and hotkeys to allow quick running of test or test suites
* Debug test scripts using your existing debug profiles

## Requirements
* __PHP:__ Version 7+
* __PHPUnit:__ Version 9, 10 & 11

To run tests with debugging:
* __XDebug:__ Version 3

To run test coverage, either:
* __XDebug:__ Version 3; or
* __PCOV:__ Version appropriate to your PHP binary

>PHP binary and PHPUnit must be installed on the environment where the tests are being run. 
>
>If you are running in a Docker container, WSL or any other remote/virtual environment, this extension will work in conjunction with the [Remote Development](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack) extension by Microsoft.

## Commands
|Command|ID|Description|
|-------|--|-----------|
|__PHPUnit: Run test method__|`phpunit-test-workbench.runMethod`|If the cursor is located within a test method, execute only that test method.|
|__PHPUnit: Run test class__|`phpunit-test-workbench.runClass`|If the active editor is for a test class, execute all test methods within the class.|
|__PHPUnit: Run test class with tag__|`phpunit-test-workbench.runClassWithTag`|If the active editor is for a test class, execute all test methods within the class tagged with the selected group.|
|__PHPUnit: Run test suite__|`phpunit-test-workbench.runSuite`|Display a dialog allowing the user to select from the list of test suites found in configuration files. All test methods within the class will be executed.|
|__PHPUnit: Run test suite with tag__|`phpunit-test-workbench.runSuiteWithTag`|Display a dialog allowing the user to select from the list of test suites found in configuration files. All test methods tagged with the selected group within the test suite will be executed.|
|__PHPUnit: Run all tests__|`phpunit-test-workbench.runAll`|Run all tests identified in the Test Explorer.|
|__PHPUnit: Run all tests with tag__|`phpunit-test-workbench.runAll`|Run all tests identified in the Test Explorer tagged with the selected group.|
|__PHPUnit: Debug test method__|`phpunit-test-workbench.debugMethod`|If the cursor is located within a test method, execute only that test method using the debugger.|
|__PHPUnit: Debug test class__|`phpunit-test-workbench.debugClass`|If the active editor is for a test class, debug all test methods within the class.|
|__PHPUnit: Debug test class with tag__|`phpunit-test-workbench.debugClassWithTag`|If the active editor is for a test class, debug all test methods within the class tagged with the selected group.|
|__PHPUnit: Debug test suite__|`phpunit-test-workbench.debugSuite`|Display a dialog allowing the user to select from the list of test suites found in configuration files. All test methods within the test suite will be executed using the debugger.|
|__PHPUnit: Debug test suite with tag__|`phpunit-test-workbench.debugSuiteWithTag`|Display a dialog allowing the user to select from the list of test suites found in configuration files. All test methods tagged with the selected group within the suite will be executed using the debugger.|
|__PHPUnit: Debug all tests__|`phpunit-test-workbench.debugAll`|Debug all tests identified in the Test Explorer.|
|__PHPUnit: Debug all tests with tag__|`phpunit-test-workbench.debugAllWithTag`|Debug all tests identified in the Test Explorer tagged with the selected group.|
|__PHPUnit: Re-execute last test run__|`phpunit-test-workbench.rerunLastTestRun`|Re-run the most recent test run. This could be a regular run, a debug run, or a run including test coverage.|

## Configuration options
|Option|Description|
|------|-----------|
|`log.level`|Control the level of information displayed in the output panel.|
|`log.autoDisplayOutput`|Control when to automatically display the Output panel showing log messages. Regardless of this setting, log output can always be viewed by opening the relevant Output panel manually.|
|`log.displayFailuresAsErrorsInCode`|If enabled, the failed assertion will be highlighted as an error in source code.|
|`php.binaryPath`|Path to the location of the PHP binary. If left blank, it will be assumed that `php` is available via the environment `$PATH` variable.|
|`phpunit.locatorPatternComposerJson`|The glob describing the location of your composer file (usually named `composer.json`). If left blank, PHPUnit Test Workbench will attempt to find a `composer.json` file in the root workspace folder. The default pattern is `composer.json`.|
|`phpunit.binaryPath`|Path to the location of the PHPUnit binary (either `phpunit` or `phpunit.phar`). If left blank, the following locations will be checked: <li>Composer `vendor` directory</li><li>`phpunit.phar` in the root of the current workspace directory</li>If not found anywhere, it will be assumed that `phpunit.phar` is available via the environment `$PATH` variable.|
|`phpunit.locatorPatternConfigXml`|The glob describing the location of your configuration file (usually named `phpunit.xml`). The default pattern is `phpunit.xml`.|
|`phpunit.testDirectory`|Relative path from the workspace folder root to the directory where tests should be executed from (usually the `tests` folder).|
|`phpunit.testFileSuffix`|Suffix used to identify test files within the test directory. If left blank, PHPUnit default suffixes (`Test.php` and `.phpt`) will be used.|
|`phpunit.coverageDriver`|Code coverage driver that PHPUnit will use to generate code coverage statistics. Either PCOV or Xdebug must be selected to enable code coverage functionality.|
|`phpunit.coverageSourceDirectory`|Path to the folder containing source code that should be included in code coverage statistics. If left emtpy, PHPUnit Test Workbench will attempt to use `./src`, `./lib` or `./app` in that order. If none of these directories are found, the workspace root will be used (however, this is not recommended as it will include test files and vendor packages).|
|`phpunit.coverageOutputDirectory`|Path to the location where a generated code coverage file should be stored. If left empty, PHPUnit Test Workbench will attempt to save it to the system temporary directory.|
|`phpunit.testNamespacePrefix`|If using PSR-4 namespaces, use this setting to map your test namespace prefix to the test directory (as defined in the `phpunit-test-workbench.phpunit.testDirectory` setting). Default is blank - this assumes that either: <li>Your `composer.json` file maps the namespaces for your test classes (__recommended__); or</li><li>The folder structure inside your test directory matches the namespace structure exactly.</li>|
|`phpunit.testOrganization`|Method used to organise and display tests in the Test Explorer:<li>__By file__: Show as a flat list of files, with test methods as children</li><li>__By namespace__: Hierarchical display, organized using the namespace structure (assumes compliance with [PSR-4](https://www.php-fig.org/psr/psr-4/))</li>|
|`phpunit.useTestSuiteDefinitions`|Use test suite definitions within your configuration file to locate and group tests in the Test Explorer. Note that using this option requires a valid PHPUnit configuration file to be found via the `phpunit.locatorPatternConfigXml` glob pattern. Test suite definitions in the configuration file will ignore the `phpunit.testDirectory` setting.|
|`xdebug.clientPort`|Default port to use for Xdebug connections, if a port is not defined in your selected debug launch configuration. Default is `9003`.|
|`xdebug.clientHost`|Default hostname to use for Xdebug connections, if a host is not defined in your selected debug launch configuration. Default is `localhost`.|

## Examples
### Test organization
![Test organisation example](docs/images/example-test-organization.gif)

### Group tests by test suite
![Group tests by test suite](docs/images/example-test-suites.gif)

### Filter tests by tags
![Group tests by test suite](docs/images/example-test-tagging.gif)

### Display of failed tests
![Display of failed tests](docs/images/example-failed-test-peek.gif)

### Debugging test scripts
![Debugging test scripts](docs/images/example-test-debugging.gif)

### Execute tests via commands
![Execute tests via commands](docs/images/example-commands.gif)

## Release notes
### v0.8.2 - 2024-11-30
* __FIXED:__ Paths in stack frames contain extraneous spaces ([#109](https://github.com/chiefmyron/phpunit-test-workbench/issues/109))

### v0.8.1 - 2024-11-30
* __FIXED:__ Named data provider elements not detected when running single test method ([#107](https://github.com/chiefmyron/phpunit-test-workbench/issues/107))

### v0.8.0 - 2024-09-06
* __NEW:__ Add support for stack traces on test failure messages ([#105](https://github.com/chiefmyron/phpunit-test-workbench/issues/105))

### v0.7.4 - 2024-05-07
* __FIXED:__ Error peek not appearing on correct line when running Laravel v10.x tests ([#101](https://github.com/chiefmyron/phpunit-test-workbench/issues/101))

### v0.7.3 - 2024-05-05
* __CHANGED:__ Shift peek for test failures to appear on the line where the test failure occurred ([#98](https://github.com/chiefmyron/phpunit-test-workbench/issues/98))

### v0.7.2 - 2024-05-02
* __FIXED:__ Renaming a test class causes child methods to be "undetected" until full refresh of tests ([#96](https://github.com/chiefmyron/phpunit-test-workbench/issues/96))

### v0.7.1 - 2024-05-01
* __FIXED:__ Debugging a test triggers code coverage ([#94](https://github.com/chiefmyron/phpunit-test-workbench/issues/94))

### v0.7.0 - 2024-04-22
* __NEW:__ Add namespace / class / method icons to items in Test Explorer ([#90](https://github.com/chiefmyron/phpunit-test-workbench/issues/90))
* __NEW:__ Add new 'Rerun last test' command ([#89](https://github.com/chiefmyron/phpunit-test-workbench/issues/89))
* __NEW:__ Add test coverage run profile ([#33](https://github.com/chiefmyron/phpunit-test-workbench/issues/33))

### v0.6.1 - 2024-02-26
* __FIXED:__ Pipe escaped characters still appearing in expected / actual result values ([#87](https://github.com/chiefmyron/phpunit-test-workbench/issues/87))

### v0.6.0 - 2024-02-26
* __NEW:__ Add support for continuous run test profiles ([#68](https://github.com/chiefmyron/phpunit-test-workbench/issues/68))
* __NEW:__ Add indicator to status bar when test detection is running ([#73](https://github.com/chiefmyron/phpunit-test-workbench/issues/73))
* __CHANGED:__ Tidy up logging and test results messages ([#81](https://github.com/chiefmyron/phpunit-test-workbench/issues/81))
* __CHANGED:__ Refactored test output parsing ([#82](https://github.com/chiefmyron/phpunit-test-workbench/issues/82))
* __FIXED:__ File watcher not triggering for test file on change while in a remote Dev Container ([#76](https://github.com/chiefmyron/phpunit-test-workbench/issues/76))
* __FIXED:__ Prevent workspace scanning for test executing more than once at the same time ([#86](https://github.com/chiefmyron/phpunit-test-workbench/issues/86))

### v0.5.0 - 2023-05-17
* __NEW:__ Use @testdox annotation as the label for test classes and methods ([#60](https://github.com/chiefmyron/phpunit-test-workbench/issues/60))
* __NEW:__ Add support for the @group annotation and attribute (and aliases) ([#61](https://github.com/chiefmyron/phpunit-test-workbench/issues/61))
* __NEW:__ Add commands for running tests with a specific flag ([#69](https://github.com/chiefmyron/phpunit-test-workbench/issues/69))
* __CHANGED:__ Add support for recording results for test methods using a data provider ([#55](https://github.com/chiefmyron/phpunit-test-workbench/issues/55))
* __FIXED:__ Fix build process so that php-parser dependency is packaged for node ([#8](https://github.com/chiefmyron/phpunit-test-workbench/issues/8))

### v0.4.2 - 2023-03-29
* __FIXED:__ Namespace folder locations not being correctly identified on Remote Workspaces - for real this time ([#58](https://github.com/chiefmyron/phpunit-test-workbench/issues/58))

### v0.4.1 - 2023-03-29
* __FIXED:__ Namespace folder locations not being correctly identified on Remote Workspaces ([#58](https://github.com/chiefmyron/phpunit-test-workbench/issues/58))

### v0.4.0 - 2023-03-28
* __NEW:__ Add support for PHPUnit 10 ([#49](https://github.com/chiefmyron/phpunit-test-workbench/issues/49))
* __NEW:__ Add detection for namespaces mapped in composer.json ([#50](https://github.com/chiefmyron/phpunit-test-workbench/issues/50))
* __CHANGED:__ Refactor test file parsing to find additional test script edge cases ([#54](https://github.com/chiefmyron/phpunit-test-workbench/issues/54))
* __FIXED:__ Not all test results captured when executing against large test suites ([#51](https://github.com/chiefmyron/phpunit-test-workbench/issues/51))

### v0.3.4 - 2022-12-12
* __FIXED:__ Editing an existing test script does not not update location of shifted class and function 'run' icons ([#47](https://github.com/chiefmyron/phpunit-test-workbench/issues/47))

### v0.3.3 - 2022-12-05
* __FIXED:__ Missing commands for debugging tests ([#45](https://github.com/chiefmyron/phpunit-test-workbench/issues/45))

### v0.3.2 - 2022-12-02
* __FIXED:__ New test added to Test Explorer on each keystroke instead of on file save ([#42](https://github.com/chiefmyron/phpunit-test-workbench/issues/42))
* __FIXED:__ All test files being reparsed whenever any single test file is saved ([#43](https://github.com/chiefmyron/phpunit-test-workbench/issues/43))

### v0.3.1 - 2022-12-01
* __FIXED:__ Some test failures not correctly detected by results parser ([#40](https://github.com/chiefmyron/phpunit-test-workbench/issues/40))

### v0.3.0 - 2022-11-28
* __NEW:__ Include pertinent information in recorded test run output ([#34](https://github.com/chiefmyron/phpunit-test-workbench/issues/34))
* __NEW:__ Add test debug run profile ([#36](https://github.com/chiefmyron/phpunit-test-workbench/issues/36))
* __NEW:__ Include summary of test run in output ([#38](https://github.com/chiefmyron/phpunit-test-workbench/issues/38))

### v0.2.0 - 2022-10-19
* __NEW:__ Detect tests identified with the `@tests` docblock annotation ([#21](https://github.com/chiefmyron/phpunit-test-workbench/issues/21))
* __NEW:__ Setting to control when Output panel is displayed on test execution ([#25](https://github.com/chiefmyron/phpunit-test-workbench/issues/25))
* __NEW:__ Highlight lines within test methods where test failures occur ([#26](https://github.com/chiefmyron/phpunit-test-workbench/issues/26))
* __NEW:__ Wire up Test Explorer cancel button to actually cancel test run ([#27](https://github.com/chiefmyron/phpunit-test-workbench/issues/27))
* __FIXED:__ Test run icons offset by 1 line from class and method identifiers ([#23](https://github.com/chiefmyron/phpunit-test-workbench/issues/23))
* __FIXED:__ Output from Git editors being parsed for test cases ([#31](https://github.com/chiefmyron/phpunit-test-workbench/issues/31))

### v0.1.3 - 2022-10-17
* __FIXED:__ Clicking the 'Run test' icon in a test class sometimes refreshes the Test Explorer instead of running the test ([#19](https://github.com/chiefmyron/phpunit-test-workbench/issues/19))
* __FIXED:__ Clicking 'Go to test' on a namespace in Test Explorer displays an error ([#17](https://github.com/chiefmyron/phpunit-test-workbench/issues/17))

### v0.1.2 - 2022-10-15
* __FIXED:__ Build error where `xml2js` library was not referenced properly

### v0.1.1 - 2022-10-15
* __FIXED:__ Commands not executing tests for specific classes or methods ([#12](https://github.com/chiefmyron/phpunit-test-workbench/issues/12))
* Updated documentation to include example images

### v0.1.0 - 2022-10-14
* Initial release
