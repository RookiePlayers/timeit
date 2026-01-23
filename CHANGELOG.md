## [1.11.7](https://github.com/RookiePlayers/clockit/compare/v1.11.6...v1.11.7) (2026-01-02)


### Bug Fixes

* Update allowed origins substitution in deployment workflows ([d24d4d9](https://github.com/RookiePlayers/clockit/commit/d24d4d9566bf2fceb85614f74c5ed2ccc427951c))


### Performance Improvements

* Add caching to high-traffic routes and optimize Cloud Run configuration ([fd93ea3](https://github.com/RookiePlayers/clockit/commit/fd93ea357a83bf15d157635e4dfdf2af9babd9fa)), closes [hi#traffic](https://github.com/hi/issues/traffic)

## [1.11.6](https://github.com/RookiePlayers/clockit/compare/v1.11.5...v1.11.6) (2026-01-02)


### Bug Fixes

* Add default substitution for _API_BASE_URL in cloudbuild ([39f5367](https://github.com/RookiePlayers/clockit/commit/39f5367d4947a2831627418f46995d44d0ff0e85))

## [1.11.5](https://github.com/RookiePlayers/clockit/compare/v1.11.4...v1.11.5) (2026-01-02)


### Bug Fixes

* Enhance deployment process by auto-detecting API_BASE_URL and improving CORS handling ([3afbb87](https://github.com/RookiePlayers/clockit/commit/3afbb87ca68151d23a7a30cd5d1116e12453e667))
* Update CORS handling to support requests without origin and normalize origins ([3a97498](https://github.com/RookiePlayers/clockit/commit/3a97498c962d15acf3807392a4b6c1b4cf5a006a))

## [1.11.4](https://github.com/RookiePlayers/clockit/compare/v1.11.3...v1.11.4) (2026-01-02)


### Bug Fixes

* Update CORS handling to support requests without origin and normalize origins ([27c9091](https://github.com/RookiePlayers/clockit/commit/27c90916f3d831bbbac49d67bcb288e4490ea2d6))

## [1.11.3](https://github.com/RookiePlayers/clockit/compare/v1.11.2...v1.11.3) (2025-12-31)


### Bug Fixes

* Wrap ClockitOnlinePageContent in Suspense for improved loading state ([027d5fe](https://github.com/RookiePlayers/clockit/commit/027d5fe8130bf24d6a9c7996f66259335ea62859))

## [1.11.2](https://github.com/RookiePlayers/clockit/compare/v1.11.1...v1.11.2) (2025-12-31)


### Bug Fixes

* Update useFeature call in ProfilePage to remove user dependency ([fe44153](https://github.com/RookiePlayers/clockit/commit/fe44153512a50eb1b5fcdc03c06038d6e47ae889))

## [1.11.1](https://github.com/RookiePlayers/clockit/compare/v1.11.0...v1.11.1) (2025-12-31)


### Bug Fixes

* Improve CORS configuration to support WebSocket connections ([3ee4a80](https://github.com/RookiePlayers/clockit/commit/3ee4a80db5d9e222aa2c1f3438d45c4649bb36b1))

# [1.11.0](https://github.com/RookiePlayers/clockit/compare/v1.10.12...v1.11.0) (2025-12-31)


### Bug Fixes

* Update API and socket URLs in apphosting configuration ([59593c2](https://github.com/RookiePlayers/clockit/commit/59593c24c04e1443f92d71f6fc728acd7e1d158a))
* Update deployment workflow ([7f1b190](https://github.com/RookiePlayers/clockit/commit/7f1b190b995b2dcb1c8d444b168a5637a4c506e7))


### Features

* Add support for guest WebSocket connections alongside authenticated users ([a077304](https://github.com/RookiePlayers/clockit/commit/a07730483f4fcd6abf7f4ad9be813ea6ab9dc3c1))

## [1.10.12](https://github.com/RookiePlayers/clockit/compare/v1.10.11...v1.10.12) (2025-12-31)


### Bug Fixes

* Implement multi-stage Docker build to compile TypeScript for faster Cloud Run startup ([b05f8b1](https://github.com/RookiePlayers/clockit/commit/b05f8b1485be072f2a27091100b2ccfe4d9d63e8))

## [1.10.11](https://github.com/RookiePlayers/clockit/compare/v1.10.10...v1.10.11) (2025-12-31)


### Bug Fixes

* Update server binding to 0.0.0.0 and enhance logging for Cloud Run compatibility ([d2d0cbd](https://github.com/RookiePlayers/clockit/commit/d2d0cbd462c491b87adbc474a5208674df4257b0))

## [1.10.10](https://github.com/RookiePlayers/clockit/compare/v1.10.9...v1.10.10) (2025-12-31)


### Bug Fixes

* Add tsc-alias to resolve TypeScript path aliases during build process ([8386971](https://github.com/RookiePlayers/clockit/commit/838697129dcb29306af62205ea5262d445dc6689))

## [1.10.9](https://github.com/RookiePlayers/clockit/compare/v1.10.8...v1.10.9) (2025-12-31)


### Bug Fixes

* Update Dockerfile to expose PORT 8080 for Cloud Run compatibility ([7544d29](https://github.com/RookiePlayers/clockit/commit/7544d29eadb7584d246155116c0fb24522f6d0cd))

## [1.10.8](https://github.com/RookiePlayers/clockit/compare/v1.10.7...v1.10.8) (2025-12-31)


### Bug Fixes

* Remove PORT variable from environment configuration in Cloud Build files ([b71bac1](https://github.com/RookiePlayers/clockit/commit/b71bac130a47863935b16cd12715a4c2442c0b1b))

## [1.10.7](https://github.com/RookiePlayers/clockit/compare/v1.10.6...v1.10.7) (2025-12-31)


### Bug Fixes

* Update Cloud Build ([4c32cb6](https://github.com/RookiePlayers/clockit/commit/4c32cb692f4b7e74e28fdae29523f06b5b2df21c))

## [1.10.6](https://github.com/RookiePlayers/clockit/compare/v1.10.5...v1.10.6) (2025-12-30)


### Bug Fixes

* Update Cloud Build ([8b3c79e](https://github.com/RookiePlayers/clockit/commit/8b3c79e6bdf4ef0624627c303d55e2ebedd28aa5))

## [1.10.5](https://github.com/RookiePlayers/clockit/compare/v1.10.4...v1.10.5) (2025-12-30)


### Bug Fixes

* Update deployment workflows to use correct Redis URL secret ([6e10f4d](https://github.com/RookiePlayers/clockit/commit/6e10f4ddddf5952ccd7fc6d6f844f2a3a883ffe9))

## [1.10.4](https://github.com/RookiePlayers/clockit/compare/v1.10.3...v1.10.4) (2025-12-30)


### Bug Fixes

* Enhance deployment workflows and add environment variable configurations for Cloud Run ([3ee8ab3](https://github.com/RookiePlayers/clockit/commit/3ee8ab3e2d5df7514f5371ea8f71521a93e85b1b))

## [1.10.3](https://github.com/RookiePlayers/clockit/compare/v1.10.2...v1.10.3) (2025-12-30)


### Bug Fixes

* Enhance deployment workflows and add environment variable configurations for Cloud Run ([4a6a534](https://github.com/RookiePlayers/clockit/commit/4a6a5346c193aecf042e599aa5778017bf8fb5d4))
* Enhance deployment workflows and add environment variable configurations for Cloud Run ([0eb07ee](https://github.com/RookiePlayers/clockit/commit/0eb07eeaa3e5093391295b0d64d4f50d59687428))

## [1.10.2](https://github.com/RookiePlayers/clockit/compare/v1.10.1...v1.10.2) (2025-12-30)


### Bug Fixes

* Update Dockerfile for multi-stage build ([c9e1eb2](https://github.com/RookiePlayers/clockit/commit/c9e1eb20025bc3d087961e9f6e2b682f3f02e282))

## [1.10.1](https://github.com/RookiePlayers/clockit/compare/v1.10.0...v1.10.1) (2025-12-30)


### Bug Fixes

* Update Dockerfile to conditionally install production dependencies ([44b6a1e](https://github.com/RookiePlayers/clockit/commit/44b6a1e05b594fdb755066daf9fffa416d7658a7))

# [1.10.0](https://github.com/RookiePlayers/clockit/compare/v1.9.0...v1.10.0) (2025-12-30)


### Features

* Add SessionCard and SessionsTab components for managing sessions and goals ([c0c29e1](https://github.com/RookiePlayers/clockit/commit/c0c29e1264691e443b9bbbf74fd7eb5f4d126e8c))
* Add SessionCard and SessionsTab components for managing sessions and goals ([d26fff6](https://github.com/RookiePlayers/clockit/commit/d26fff685d9a1e61fe5dc5966d4a1cefbe968c24))

# [1.9.0](https://github.com/RookiePlayers/clockit/compare/v1.8.0...v1.9.0) (2025-12-07)


### Features

* Add goals management and integration with Jira ([97b8f71](https://github.com/RookiePlayers/clockit/commit/97b8f71ed056af16d2d2f957e00225fa168ea6e2))

# [1.8.0](https://github.com/RookiePlayers/clockit/compare/v1.7.1...v1.8.0) (2025-12-06)


### Bug Fixes

* Correct CSV header in CsvSink tests ([536c178](https://github.com/RookiePlayers/clockit/commit/536c17860e149ef84e3e776238b4d8c53bffea9e))
* Update CSV header to include 'ideName' in tests ([bc7738d](https://github.com/RookiePlayers/clockit/commit/bc7738d5573300e7715686384cff8254f1da1278))


### Features

* Big quality of life improvements on clockit cloud ([c830e9e](https://github.com/RookiePlayers/clockit/commit/c830e9e6a500621d6d4416b01c09178d0864df35))
* Big quality of life improvements on clockit cloud ([cd100f3](https://github.com/RookiePlayers/clockit/commit/cd100f3a5b1057654c0424bfb6a6688caf63b800))

## [1.7.1](https://github.com/RookiePlayers/clockit/compare/v1.7.0...v1.7.1) (2025-12-03)


### Bug Fixes

* Update metric handling and enhance recent activity navigation ([5a2805c](https://github.com/RookiePlayers/clockit/commit/5a2805c1cc2e198ae14e9db14afa8655bb3be5ac))

# [1.7.0](https://github.com/RookiePlayers/clockit/compare/v1.6.0...v1.7.0) (2025-12-03)


### Bug Fixes

* Update API URLs and settings for cloud functionality ([17dc51b](https://github.com/RookiePlayers/clockit/commit/17dc51b7a67de2eb0c16a97874932f4b1ea70664))


### Features

* Update API URLs and settings for cloud functionality ([801311d](https://github.com/RookiePlayers/clockit/commit/801311da37d4d3de4607619c4afe8fec964b5a1b))

# [1.6.0](https://github.com/RookiePlayers/clockit/compare/v1.5.4...v1.6.0) (2025-12-03)


### Features

* Add notistack for notifications and implement refresh functionality in stats ([12c6d5e](https://github.com/RookiePlayers/clockit/commit/12c6d5e213bf9f0448b04dfd2570c246fad87ced))
* Add upload detail page with data fetching and display functionality ([dc0d9c6](https://github.com/RookiePlayers/clockit/commit/dc0d9c684dda03cd1f44c3539ebbb15e2d940dd9))

## [1.5.4](https://github.com/RookiePlayers/clockit/compare/v1.5.3...v1.5.4) (2025-11-24)


### Bug Fixes

* Implement cloud configuration checks and add tests for settings registration ([b00d96a](https://github.com/RookiePlayers/clockit/commit/b00d96a95f68b9d51b67c2a1246b8d0158a19eae))

## [1.5.3](https://github.com/RookiePlayers/clockit/compare/v1.5.2...v1.5.3) (2025-11-24)


### Bug Fixes

* Enhance workspace tracking with top workspaces display and improved metrics ([b9ed166](https://github.com/RookiePlayers/clockit/commit/b9ed1669dcf47aa33d8442fbb1279542edb51d33))

## [1.5.2](https://github.com/RookiePlayers/clockit/compare/v1.5.1...v1.5.2) (2025-11-24)


### Bug Fixes

* Update favicon.ico for improved branding ([76669f9](https://github.com/RookiePlayers/clockit/commit/76669f9ca0e51fa73d30e548e36cc334ea7b3187))

## [1.5.1](https://github.com/RookiePlayers/clockit/compare/v1.5.0...v1.5.1) (2025-11-24)


### Bug Fixes

* Update package version to 1.5.0 and add @semantic-release/exec dependency ([202a073](https://github.com/RookiePlayers/clockit/commit/202a0736f665d91d49cfa51c4fd28c3b03add226))
* Update release configuration for VSIX packaging and asset naming ([4bf5cc2](https://github.com/RookiePlayers/clockit/commit/4bf5cc29d082bb835abf2d89154a858540924539))

# [1.5.0](https://github.com/RookiePlayers/clockit/compare/v1.4.0...v1.5.0) (2025-11-24)


### Features

* Add Privacy, Profile, and Request Data pages with user data management features ([5ef1410](https://github.com/RookiePlayers/clockit/commit/5ef1410d8d2723b388343c99e07542943dc326de))

# [1.4.0](https://github.com/RookiePlayers/clockit/compare/v1.3.1...v1.4.0) (2025-11-22)


### Features

* Added New Website ([02620f7](https://github.com/RookiePlayers/clockit/commit/02620f7d0241c3671cd1c3362948c14815750ca0))

## [1.3.1](https://github.com/RookiePlayers/clockit/compare/v1.3.0...v1.3.1) (2025-11-21)


### Bug Fixes

* Update VSIX artifact naming in build workflow and release configuration ([e3775ef](https://github.com/RookiePlayers/clockit/commit/e3775ef1ca31ea8324547a4d945d92d92492c18b))

# [1.3.0](https://github.com/RookiePlayers/clockit/compare/v1.2.0...v1.3.0) (2025-11-21)


### Bug Fixes

* Update repository links and version in package files; correct changelog URLs ([f0a8db3](https://github.com/RookiePlayers/clockit/commit/f0a8db3f184d0c270fcd9df4a0bd4ed60d6b9843))


### Features

* Enhance build workflow and update VSCode ignore settings ([c285bf1](https://github.com/RookiePlayers/clockit/commit/c285bf16addce66bc44a6314b920f82209db9382))

# [1.2.0](https://github.com/RookiePlayers/clockit/compare/v1.1.1...v1.2.0) (2025-11-21)


### Features

* Update VSCode engine version and enhance CSV output options ([be750a2](https://github.com/RookiePlayers/clockit/commit/be750a2c9810db786c13f8d63291d21a9c1977a6))

## [1.1.1](https://github.com/RookiePlayers/clockit/compare/v1.1.0...v1.1.1) (2025-11-07)


### Bug Fixes

* Update repository and homepage URLs in package.json to reflect correct project location ([056e7eb](https://github.com/RookiePlayers/clockit/commit/056e7eb659543b2455a4b828619faf5f6b8486a6))

# [1.1.0](https://github.com/RookiePlayers/clockit/compare/v1.0.0...v1.1.0) (2025-11-07)


### Features

* Add icon.png to package.json for improved branding ([45ef89f](https://github.com/RookiePlayers/clockit/commit/45ef89fcf1bca485e65b73138c9eb68c46f0f44c))

# 1.0.0 (2025-11-07)


### Bug Fixes

* Add missing build script to package.json ([35d039f](https://github.com/RookiePlayers/clockit/commit/35d039f1ee172a915079505e5ee17bb38d2c6be0))
* Change to npm ([4567e12](https://github.com/RookiePlayers/clockit/commit/4567e12d579a4fa4fabb1b0e88692b6d430095ee))
* Change to npm ([96b4a88](https://github.com/RookiePlayers/clockit/commit/96b4a8827b842334a7a1e8f233250270b8e39b58))
* Refactor code structure for improved readability and maintainability ([3881562](https://github.com/RookiePlayers/clockit/commit/38815629daf3a7c01dae1365cba0a0a4d3646de4))
* Set npmPublish to false in release configuration ([766bc0a](https://github.com/RookiePlayers/clockit/commit/766bc0ab59253b7f2bf0931e06e4519920589766))


### Features

* Add GitHub workflows for CI, build, and deployment processes ([022462a](https://github.com/RookiePlayers/clockit/commit/022462af4d2ad46dc863de4b88161284169b2102))
* Refactor clockit extension to clockit_logger ([4a0d20c](https://github.com/RookiePlayers/clockit/commit/4a0d20c50381d74cb2c75a3663f1594703d91af9))

# Change Log

All notable changes to the "clockit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release
