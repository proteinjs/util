# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.3](https://github.com/proteinjs/util/compare/@proteinjs/logger@1.0.2...@proteinjs/logger@1.0.3) (2024-08-13)


### Bug Fixes

* `Logger` now queries the `SourceRepository` for a `DefaultLogWriter` lazily. This way, if a `Logger` happens to be instantiated outside of a function or class, it will still be able to get the `DefaultLogWriter` if logging is done within a function or class. ([f9e0e90](https://github.com/proteinjs/util/commit/f9e0e9008e8f13543adef27500142b91bc959c5f))





## [1.0.2](https://github.com/proteinjs/util/compare/@proteinjs/logger@1.0.1...@proteinjs/logger@1.0.2) (2024-08-13)


### Bug Fixes

* `Logger` constructor arg now optional ([c85e337](https://github.com/proteinjs/util/commit/c85e3375d6a299d3d0b72fb0ba6d058e7798ab79))





## 1.0.1 (2024-08-13)

**Note:** Version bump only for package @proteinjs/logger
