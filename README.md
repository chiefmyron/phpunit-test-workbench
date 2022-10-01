# PHPUnit Test Workbench

An extension to integrate PHPUnit with the native Test Explorer functionality within VS Code. Zero configuration required for common environment setups (i.e. where `php` is in your environment path, and PHPUnit is installed via Composer or included as a PHAR library).

## Features
* Integrates with standard VS Code Test Explorer
* Organise and run your tests:
  * By namespace
  * By test suite (as defined in your `phpunit.xml` configuration file)
  * Simple list of files and methods
* Errors appear as a peak within the editor
* History of test run results and execution times is maintained
* Includes commands and hotkeys to allow quick running of test or test suites

## Requirements
* __PHP:__ Version 7
* __PHPUnit:__ Currently only tested on version 9

>PHP binary and PHPUnit must be installed on the environment where the tests are being run. 
>
>If you are running in a Docker container, WSL or any other remote/virtual environment, this extension will work in conjunction with the [Remote Development](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack) extension by Microsoft.

## Commands
|Command|Description|
|-------|-----------|
|PHPUnit: Run test method|If the cursor is located within a test method, execute only that test method.|
|PHPUnit: Run test class|If the active editor is for a test class, execute all test methods within the class.|
|PHPUnit: Run test suite|TBC|
|PHPUnit: Run all tests|Run all tests identified in the Test Explorer|

## Configuration options
|Option|Description|
|------|-----------|
|`log.level`|Control the level of information displayed in the output panel.|
|`log.channel`|Send output either to an Output panel in the editor, or a log file.|
|`log.file`|Path and filename to log output to (if log file is chosen as the logging channel).|
|`php.binaryPath`|Path to the location of the PHP binary. If left blank, it will be assumed that `php` is available via the environment `$PATH` variable.|
|`phpunit.binaryPath`|Path to the location of the PHPUnit binary (either `phpunit` or `phpunit.phar`). If left blank, the following locations will be checked: <li>Composer `vendor` directory</li><li>`phpunit.phar` in the root of the current workspace directory</li>If not found anywhere, it will be assumed that `phpunit.phar` is available via the environment `$PATH` variable.|
|`phpunit.testOrganization`|Method used to organise and display tests in the Test Explorer:<li>__By file__: Show as a flat list of files, with test methods as children</li><li>__By namespace__: Hierarchical display, organized using the namespace structure (assumes compliance with [PSR-4](https://www.php-fig.org/psr/psr-4/))</li><li>__By test suite__: Uses the test suite structure defined in the `phpunit.xml` configuration file (if found).</li>|
|`phpunit.locatorPatternTests`|The glob describing the location to look for test files. The default pattern is `{test,tests,Test,Tests}/**/*Test.php`.|
|`phpunit.locatorPatternPhpUnitXml`|The glob describing the location to look for the `phpunit.xml` configuration file. The default pattern is `{test,tests,Test,Tests}/phpunit.xml`.|
|`phpunit.targetDirectory`|Relative path from the workspace folder root to the directory where tests should be executed from (usually the `tests` folder). <br><br>__Note:__ If left blank, the workspace folder root will be used. Note that if a `phpunit.xml` file has been found with test suites defined, this setting is ignored.|

## Known issues
* [Issue 1](https://github.com/chiefmyron/phpunit-test-workbench/issues/1) - Logging level settings change not applied until extension is reloaded

## Release notes
### v0.1 - 2022-09-29
* Initial release
