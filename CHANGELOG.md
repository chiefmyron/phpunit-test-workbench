# Change Log

All notable changes to the "phpunit-test-workbench" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.8.2] - 2024-11-30
### Fixed
- Paths in stack frames contain extraneous spaces ([#109](https://github.com/chiefmyron/phpunit-test-workbench/issues/109))

## [0.8.1] - 2024-11-30
### Fixed
- Named data provider elements not detected when running single test method ([#107](https://github.com/chiefmyron/phpunit-test-workbench/issues/107))

## [0.8.0] - 2024-09-06
### New
- Add support for stack traces on test failure messages ([#105](https://github.com/chiefmyron/phpunit-test-workbench/issues/105))

## [0.7.4] - 2024-05-07
### Fixed
- Error peek not appearing on correct line when running Laravel v10.x tests ([#101](https://github.com/chiefmyron/phpunit-test-workbench/issues/101))

## [0.7.3] - 2024-05-05
### Changed
- Shift peek for test failures to appear on the line where the test failure occurred ([#98](https://github.com/chiefmyron/phpunit-test-workbench/issues/98))

## [0.7.2] - 2024-05-02
### Fixed
- Renaming a test class causes child methods to be "undetected" until full refresh of tests ([#96](https://github.com/chiefmyron/phpunit-test-workbench/issues/96))

## [0.7.1] - 2024-05-01
### Fixed
- Debugging a test triggers code coverage ([#94](https://github.com/chiefmyron/phpunit-test-workbench/issues/94))

## [0.7.0] - 2024-04-22
### New
- Add namespace / class / method icons to items in Test Explorer ([#90](https://github.com/chiefmyron/phpunit-test-workbench/issues/90))
- Add new 'Rerun last test' command ([#89](https://github.com/chiefmyron/phpunit-test-workbench/issues/89))
- Add test coverage run profile ([#33](https://github.com/chiefmyron/phpunit-test-workbench/issues/33))

## [0.6.1] - 2024-02-26
### Fixed
- Pipe escaped characters still appearing in expected / actual result values ([#87](https://github.com/chiefmyron/phpunit-test-workbench/issues/87))

## [0.6.0] - 2024-02-26
### New
- Add support for continuous run test profiles ([#68](https://github.com/chiefmyron/phpunit-test-workbench/issues/68))
- Add indicator to status bar when test detection is running ([#73](https://github.com/chiefmyron/phpunit-test-workbench/issues/73))

### Changed
- Tidy up logging and test results messages ([#81](https://github.com/chiefmyron/phpunit-test-workbench/issues/81))
- Refactored test output parsing ([#82](https://github.com/chiefmyron/phpunit-test-workbench/issues/82))

### Fixed
- File watcher not triggering for test file on change while in a remote Dev Container ([#76](https://github.com/chiefmyron/phpunit-test-workbench/issues/76))
- Prevent workspace scanning for test executing more than once at the same time ([#86](https://github.com/chiefmyron/phpunit-test-workbench/issues/86))

## [0.5.0] - 2023-05-17
### New
- Use @testdox annotation as the label for test classes and methods ([#60](https://github.com/chiefmyron/phpunit-test-workbench/issues/60))
- Add support for the @group annotation and attribute (and aliases) ([#61](https://github.com/chiefmyron/phpunit-test-workbench/issues/61))
- Add commands for running tests with a specific flag ([#69](https://github.com/chiefmyron/phpunit-test-workbench/issues/69))

### Changed
- Add support for recording results for test methods using a data provider ([#55](https://github.com/chiefmyron/phpunit-test-workbench/issues/55))

### Fixed
- Fix build process so that php-parser dependency is packaged for node ([#8](https://github.com/chiefmyron/phpunit-test-workbench/issues/8))

---

## [0.4.2] - 2023-03-29
### Fixed
- Namespace folder locations not being correctly identified on Remote Workspaces - for real this time ([#58](https://github.com/chiefmyron/phpunit-test-workbench/issues/58))

---

## [0.4.1] - 2023-03-29
### Fixed
- Namespace folder locations not being correctly identified on Remote Workspaces ([#58](https://github.com/chiefmyron/phpunit-test-workbench/issues/58))

---

## [0.4.0] - 2023-03-28
### New
- Add support for PHPUnit 10 ([#49](https://github.com/chiefmyron/phpunit-test-workbench/issues/49))
- Add detection for namespaces mapped in composer.json ([#50](https://github.com/chiefmyron/phpunit-test-workbench/issues/50))

### Changed
- Refactor test file parsing to find additional test script edge cases ([#54](https://github.com/chiefmyron/phpunit-test-workbench/issues/54))

### Fixed
- Not all test results captured when executing against large test suites ([#51](https://github.com/chiefmyron/phpunit-test-workbench/issues/51))

---

## [0.3.4] - 2022-12-12
### Fixed
- Editing an existing test script does not not update location of shifted class and function 'run' icons ([#47](https://github.com/chiefmyron/phpunit-test-workbench/issues/47))

---

## [0.3.3] - 2022-12-05
### Fixed
- Missing commands for debugging tests ([#45](https://github.com/chiefmyron/phpunit-test-workbench/issues/45))

---

## [0.3.2] - 2022-12-02
### Fixed
- New test added to Test Explorer on each keystroke instead of on file save ([#42](https://github.com/chiefmyron/phpunit-test-workbench/issues/42))
- All test files being reparsed whenever any single test file is saved ([#43](https://github.com/chiefmyron/phpunit-test-workbench/issues/43))

---

## [0.3.1] - 2022-12-01
### Fixed
- Some test failures not correctly detected by results parser ([#40](https://github.com/chiefmyron/phpunit-test-workbench/issues/40))

---

## [0.3.0] - 2022-11-28
### Added
- Include pertinent information in recorded test run output ([#34](https://github.com/chiefmyron/phpunit-test-workbench/issues/34))
- Add test debug run profile ([#36](https://github.com/chiefmyron/phpunit-test-workbench/issues/36))
- Include summary of test run in output ([#38](https://github.com/chiefmyron/phpunit-test-workbench/issues/38))

---

## [0.2.0] - 2022-10-19
### Added
- Detect tests identified with the `@tests` docblock annotation ([#21](https://github.com/chiefmyron/phpunit-test-workbench/issues/21))
- Setting to control when Output panel is displayed on test execution ([#25](https://github.com/chiefmyron/phpunit-test-workbench/issues/25))
- Highlight lines within test methods where test failures occur ([#26](https://github.com/chiefmyron/phpunit-test-workbench/issues/26))
- Wire up Test Explorer cancel button to actually cancel test run ([#27](https://github.com/chiefmyron/phpunit-test-workbench/issues/27))

### Fixed
- Test run icons offset by 1 line from class and method identifiers ([#23](https://github.com/chiefmyron/phpunit-test-workbench/issues/23))
- Output from Git editors being parsed for test cases ([#31](https://github.com/chiefmyron/phpunit-test-workbench/issues/31))

---

## [0.1.3] - 2022-10-17
### Fixed
- Clicking the 'Run test' icon in a test class sometimes refreshes the Test Explorer instead of running the test ([#19](https://github.com/chiefmyron/phpunit-test-workbench/issues/19))
- Clicking 'Go to test' on a namespace in Test Explorer displays an error ([#17](https://github.com/chiefmyron/phpunit-test-workbench/issues/17))

---

## [0.1.2] - 2022-10-15
### Fixed
- Build error where `xml2js` library was not referenced properly

---

## [0.1.1] - 2022-10-15
### Changed
- Updated README.md documentation to include example gif images

### Fixed
- Commands not executing tests for specific classes or methods ([#12](https://github.com/chiefmyron/phpunit-test-workbench/issues/12))

---

## [0.1.0] - 2022-10-14
- Initial release

[0.8.2]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.7.4...v0.8.0
[0.7.4]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/chiefmyron/phpunit-test-workbench/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/chiefmyron/phpunit-test-workbench/releases/tag/v0.1.0