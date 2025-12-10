# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.13](https://github.com/proteinjs/util/compare/@proteinjs/logger@1.0.12...@proteinjs/logger@1.0.13) (2025-12-10)

**Note:** Version bump only for package @proteinjs/logger





## [1.0.6](https://github.com/proteinjs/util/compare/@proteinjs/logger@1.0.5...@proteinjs/logger@1.0.6) (2024-08-28)


### Bug Fixes

* `Log.error?` is now of type any, since that's a common error type and we shouldn't force errors to be of type `Error` to be logged ([eed6f56](https://github.com/proteinjs/util/commit/eed6f566f530f1dd707edcd086793bfa54d353db))





## [1.0.4](https://github.com/proteinjs/util/compare/@proteinjs/logger@1.0.3...@proteinjs/logger@1.0.4) (2024-08-13)


### Bug Fixes

* `DevLogWriter` now colors the timestamp gray ([4178f39](https://github.com/proteinjs/util/commit/4178f39207964a39a8e81b252a2e57fe7458a366))





## [1.0.3](https://github.com/proteinjs/util/compare/@proteinjs/logger@1.0.2...@proteinjs/logger@1.0.3) (2024-08-13)


### Bug Fixes

* `Logger` now queries the `SourceRepository` for a `DefaultLogWriter` lazily. This way, if a `Logger` happens to be instantiated outside of a function or class, it will still be able to get the `DefaultLogWriter` if logging is done within a function or class. ([f9e0e90](https://github.com/proteinjs/util/commit/f9e0e9008e8f13543adef27500142b91bc959c5f))





## [1.0.2](https://github.com/proteinjs/util/compare/@proteinjs/logger@1.0.1...@proteinjs/logger@1.0.2) (2024-08-13)


### Bug Fixes

* `Logger` constructor arg now optional ([c85e337](https://github.com/proteinjs/util/commit/c85e3375d6a299d3d0b72fb0ba6d058e7798ab79))





## 1.0.1 (2024-08-13)

**Note:** Version bump only for package @proteinjs/logger
