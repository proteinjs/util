# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.11.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.10.6...@proteinjs/util-node@1.11.0) (2026-09-03)


### Features

* **util-node:** workspace membership is declared, never crawled — WorkspaceDeclaration is the one owner of which package.json files are members: a root's lerna.json `packages` (lerna's default packages/* when the field is absent) plus the root package.json `workspacePackages` extra roots name exactly its members; a declared root OWNS its subtree (nothing undeclared beneath it is a member, however the tree is walked from above); only a tree with no declaration at its root is crawled — bounded exactly as before (no hidden dirs, node_modules, dist, symlinks) — and it hands every declared root it meets to that root's declaration. Hard errors naming their paths: a declared literal with no package.json; two leaf packages sharing a name (containers — every root in the metarepo is named `root` — are path-identified and exempt). npm's own `workspaces` field is deliberately not read (a different install model). Why: n3xah/app Deploy to Test run 33747781291 (2026-09-03) — CI fixture trees carrying the app's own package names shadowed packages/common, server and ui in the crawl (last path wins), build-workspace built "1 package in workspace", the image shipped with no packages/server/dist, and the migration gate failed on `Cannot find module dist/generated/index.js`. RED RUN stated: the shadowing repro through PackageUtil.getWorkspaceMetadata resolved @t/server to the fixture path at the pre-fix scanner; green with the declaration wired in. Bites verified: collision check disarmed -> the collision pin red alone; declaration ignored at the root -> repro + globs + literal-missing red; restored green. Suite: packages/node 6 suites / 30 tests green (24 pre-existing + 6 new). ([a8f3684](https://github.com/proteinjs/util/commit/a8f368494a07146d850c33584428945601d223e3))





## [1.10.6](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.10.5...@proteinjs/util-node@1.10.6) (2026-09-02)


### Bug Fixes

* **util-node:** Fs glob helpers prune ignored directories under a dot-directory base path — match relative to cwd (absolute:true) instead of folding the directory into an absolute pattern. In the absolute form fast-glob matched the ignore list against the absolute entry path and a globstar does not cross a dot-segment, so under ~/.n3xa/workspaces/<name> (the default local workspaces root) or a .scratch estate the ignore list matched nothing: every node_modules/dist was walked in full, workspace symlinks followed into cycles, and the dev-skill Glob of every package.json over a materialized metarepo exhausted a 12G heap three times running (2026-09-02). getFilePaths now rides the same path (its dir + '**/*' form walked one level only without a trailing separator). RED RUN stated: Fs.getFilePathsMatchingGlob.test 3/3 red at the pre-fix code (EACCES from inside node_modules/dep/locked under a dot-directory tmp root — the walk provably entering node_modules); green with the cwd form. Bite verified: absolute form re-introduced -> 3/3 red; restored green. Suite: packages/node 5 suites / 24 tests green (21 pre-existing + 3 new). ([2aace27](https://github.com/proteinjs/util/commit/2aace277e5e5727dc2666ee0a3cd3d49a3c69932))





## [1.10.5](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.10.4...@proteinjs/util-node@1.10.5) (2026-09-02)


### Bug Fixes

* **util-node:** parseArgsMap splits on the FIRST '=' only — values with embedded '=' (the estate CLI's --note among them) previously truncated at the second '=' (split('=')[1] kept one segment). The parser now preserves the full value after the first separator; bare flags and empty values unchanged. RED RUN stated: ArgsMap.test 2/6 red at the pre-fix code (--note=a=b=c parsed as 'a'); green with the indexOf split. Bite verified: truncation re-introduced -> the 2 embedded-'=' pins red alone; restored green. Suite: packages/node 4 suites / 21 tests green (15 pre-existing + 6 new). ([277c1d6](https://github.com/proteinjs/util/commit/277c1d65e15d874f7c1750b3edf63bf905120780))





## [1.10.4](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.10.3...@proteinjs/util-node@1.10.4) (2026-08-17)


### Bug Fixes

* package identity is the package.json path — name-keyed discovery dropped same-named packages ([9cd9721](https://github.com/proteinjs/util/commit/9cd9721dec7052f65b1021a4c004900ff19802a8)), closes [#75](https://github.com/proteinjs/util/issues/75)





## [1.10.3](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.10.2...@proteinjs/util-node@1.10.3) (2026-08-15)


### Bug Fixes

* bounded workspace package discovery — replace glob walk that descended unpruned into hidden directories ([04a56bb](https://github.com/proteinjs/util/commit/04a56bb228536ffa2fb63e888524c672f4cca186))





## [1.10.2](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.10.1...@proteinjs/util-node@1.10.2) (2026-08-13)

**Note:** Version bump only for package @proteinjs/util-node





# [1.10.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.9.0...@proteinjs/util-node@1.10.0) (2026-07-28)


### Features

* expose PackageUtil.getTransitiveWorkspaceDependencies ([72fa5b8](https://github.com/proteinjs/util/commit/72fa5b8208e38e04ab06a27446e21b549d21b1c9))





# [1.9.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.8.1...@proteinjs/util-node@1.9.0) (2026-06-24)


### Features

* symlink-workspace links each package's transitive workspace-dep closure ([55a7c25](https://github.com/proteinjs/util/commit/55a7c2541f500bec4e12bb05454acadd6b4c4b66))





## [1.8.1](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.8.0...@proteinjs/util-node@1.8.1) (2026-04-14)


### Bug Fixes

* make symlink-workspace portable and self-sufficient ([fa34e5f](https://github.com/proteinjs/util/commit/fa34e5f4f7d4fa6785cda8a4747964904020202d))





# [1.8.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.7.3...@proteinjs/util-node@1.8.0) (2026-04-13)


### Features

* chmod +x bin files after symlinking local dependencies ([10040cf](https://github.com/proteinjs/util/commit/10040cf8393b9369a997fbaccc1c337ee1871a37))





## [1.7.3](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.7.2...@proteinjs/util-node@1.7.3) (2026-04-13)


### Bug Fixes

* create scoped package parent directories before symlinking ([8096064](https://github.com/proteinjs/util/commit/8096064c6c32f7477c1b13df79dd52283a973a91))





## [1.7.2](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.7.1...@proteinjs/util-node@1.7.2) (2026-03-06)

**Note:** Version bump only for package @proteinjs/util-node





## [1.7.1](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.7.0...@proteinjs/util-node@1.7.1) (2026-01-26)


### Bug Fixes

* `Fs.grep` configure `cmd` call to no longer write to stderr and stdout (still returns their content). ([0a7d7e6](https://github.com/proteinjs/util/commit/0a7d7e6a5704ab1939061c41263e535cbd2254d8))





# [1.7.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.6.1...@proteinjs/util-node@1.7.0) (2026-01-23)


### Features

* `Fs` added `deleteFiles`. ([cbed0a1](https://github.com/proteinjs/util/commit/cbed0a1e3c9486efd7ad00555f8a944d397253c6))





## [1.6.1](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.6.0...@proteinjs/util-node@1.6.1) (2025-12-10)


### Bug Fixes

* `Fs.grep` exclude `package-lock.json`s by default. ([33b4c13](https://github.com/proteinjs/util/commit/33b4c13b59058d41fc8ed907648771535c50cb8c))





# [1.6.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.5.0...@proteinjs/util-node@1.6.0) (2025-10-31)


### Features

* `PackageUtil` return `CmdResult` where appropriate. ([7a93433](https://github.com/proteinjs/util/commit/7a93433e5bf0e55e7fd850fcaa18ff86f06b7483))





# [1.5.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.4.2...@proteinjs/util-node@1.5.0) (2025-10-14)


### Features

* `cmd` return `CmdResult` to be able to programmatically access log output and exit code. ([7dad1a1](https://github.com/proteinjs/util/commit/7dad1a158d692dab502d112b4beb0e3662a1cc70))
* Added `Fs.grep` ([0c6b07f](https://github.com/proteinjs/util/commit/0c6b07f549122de8cc6e33ddd2480cdf38f531a3))
* Added various git commands ([5adbfd7](https://github.com/proteinjs/util/commit/5adbfd7a05a10af3fde0949dd5c8eed02a9da571))





## [1.4.2](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.4.1...@proteinjs/util-node@1.4.2) (2025-04-11)

**Note:** Version bump only for package @proteinjs/util-node





## [1.4.1](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.4.0...@proteinjs/util-node@1.4.1) (2024-08-16)


### Bug Fixes

* deprecated `Logger` ([1673a37](https://github.com/proteinjs/util/commit/1673a377945271da4d99b564acdecb22e397ba86))





# [1.4.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.3.3...@proteinjs/util-node@1.4.0) (2024-08-05)


### Features

* add email regex ([3938f1d](https://github.com/proteinjs/util/commit/3938f1d5ca3aa4a5f2b98518a84468794110bfd1))





## [1.3.3](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.3.2...@proteinjs/util-node@1.3.3) (2024-07-12)

**Note:** Version bump only for package @proteinjs/util-node





## [1.3.2](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.3.1...@proteinjs/util-node@1.3.2) (2024-07-12)

**Note:** Version bump only for package @proteinjs/util-node





## [1.3.1](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.3.0...@proteinjs/util-node@1.3.1) (2024-07-06)


### Bug Fixes

* `Fs.createFolder` should be recursive so it creates parents if they don't exist ([6fda0dc](https://github.com/proteinjs/util/commit/6fda0dcd3302182a920eb8d909770b7accadddf0))





# [1.3.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.2.2...@proteinjs/util-node@1.3.0) (2024-07-05)


### Features

* add debouncer ([#1](https://github.com/proteinjs/util/issues/1)) ([209f157](https://github.com/proteinjs/util/commit/209f1575f8370ba94033bdfbcebd745e1aa5aa1e))





## [1.2.2](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.2.1...@proteinjs/util-node@1.2.2) (2024-05-10)


### Bug Fixes

* add .md file type to lint ignore files ([ecb6d28](https://github.com/proteinjs/util/commit/ecb6d28340221ff0a2854debf0d813a02a76786e))





## [1.2.1](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.2.0...@proteinjs/util-node@1.2.1) (2024-05-10)


### Bug Fixes

* add linting and lint all files ([425c7a6](https://github.com/proteinjs/util/commit/425c7a6bee816a6b7cfafcb4b8d59a22cba5ec04))





# [1.2.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.1.0...@proteinjs/util-node@1.2.0) (2024-04-30)

### Features

- added `LogColorWrapper` for simple log coloring ([9f42d48](https://github.com/proteinjs/util/commit/9f42d4805421c4b43b0b04b7979ee7793c87cb68))
- updated `LocalPackage` and `WorkspaceMetadata` to have workspace root metadata ([f2606bc](https://github.com/proteinjs/util/commit/f2606bc77adbadc82ca10e467d8a0044d6e3612b))

# [1.1.0](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.0.23...@proteinjs/util-node@1.1.0) (2024-04-25)

### Features

- added `isInstanceOf` to replace use of `instanceof` for use in published packages. supports inheritance ([e61aba1](https://github.com/proteinjs/util/commit/e61aba135c20e340d5c7b7c46795fa1131620fbd))

## [1.0.23](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.0.22...@proteinjs/util-node@1.0.23) (2024-04-20)

**Note:** Version bump only for package @proteinjs/util-node

## [1.0.22](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.0.21...@proteinjs/util-node@1.0.22) (2024-04-19)

### Bug Fixes

- [util-node] added dep (was devDep) on typescript ([b9d20ca](https://github.com/proteinjs/util/commit/b9d20cad9666a13cb74c6a431f0f010ba8f9117e))

## [1.0.21](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.0.20...@proteinjs/util-node@1.0.21) (2024-04-18)

### Bug Fixes

- `Fs` use fsExtra for deleteFolder ([4f79f2b](https://github.com/proteinjs/util/commit/4f79f2b01e34c77f63cd4793deb4e7ee62428df8))

## [1.0.20](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.0.19...@proteinjs/util-node@1.0.20) (2024-04-18)

**Note:** Version bump only for package @proteinjs/util-node

## [1.0.19](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.0.18...@proteinjs/util-node@1.0.19) (2024-04-18)

**Note:** Version bump only for package @proteinjs/util-node

## [1.0.18](https://github.com/proteinjs/util/compare/@proteinjs/util-node@1.0.17...@proteinjs/util-node@1.0.18) (2024-04-16)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.17 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.16 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.15 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.14 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.13 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.12 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.11 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.10 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.9 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.8 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.7 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.6 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.5 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.4 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.3 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.2 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node

## 1.0.1 (2024-04-11)

**Note:** Version bump only for package @proteinjs/util-node
