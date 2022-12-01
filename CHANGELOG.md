# Change Log

All notable changes to the "phpunit-test-workbench" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2022-12-01
### Fixed
- Some test failures not correctly detected by results parser ([#40](https://github.com/chiefmyron/phpunit-test-workbench/issues/40))

## [0.3.0] - 2022-11-28
### Added
- Include pertinent information in recorded test run output ([#34](https://github.com/chiefmyron/phpunit-test-workbench/issues/34))
- Add test debug run profile ([#36](https://github.com/chiefmyron/phpunit-test-workbench/issues/36))
- Include summary of test run in output ([#38](https://github.com/chiefmyron/phpunit-test-workbench/issues/38))

## [0.2.0] - 2022-10-19
### Added
- Detect tests identified with the `@tests` docblock annotation ([#21](https://github.com/chiefmyron/phpunit-test-workbench/issues/21))
- Setting to control when Output panel is displayed on test execution ([#25](https://github.com/chiefmyron/phpunit-test-workbench/issues/25))
- Highlight lines within test methods where test failures occur ([#26](https://github.com/chiefmyron/phpunit-test-workbench/issues/26))
- Wire up Test Explorer cancel button to actually cancel test run ([#27](https://github.com/chiefmyron/phpunit-test-workbench/issues/27))

### Fixed
- Test run icons offset by 1 line from class and method identifiers ([#23](https://github.com/chiefmyron/phpunit-test-workbench/issues/23))
- Output from Git editors being parsed for test cases ([#31](https://github.com/chiefmyron/phpunit-test-workbench/issues/31))

## [0.1.3] - 2022-10-17
### Fixed
- Clicking the 'Run test' icon in a test class sometimes refreshes the Test Explorer instead of running the test ([#19](https://github.com/chiefmyron/phpunit-test-workbench/issues/19))
- Clicking 'Go to test' on a namespace in Test Explorer displays an error ([#17](https://github.com/chiefmyron/phpunit-test-workbench/issues/17))

## [0.1.2] - 2022-10-15
### Fixed
- Build error where `xml2js` library was not referenced properly

## [0.1.1] - 2022-10-15
### Changed
- Updated README.md documentation to include example gif images

### Fixed
- Commands not executing tests for specific classes or methods ([#12](https://github.com/chiefmyron/phpunit-test-workbench/issues/12))

## [0.1.0] - 2022-10-14
- Initial release