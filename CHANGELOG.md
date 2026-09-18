# Changelog

## [0.7.0](https://github.com/bhastings-t3/event-storming-recovery/compare/event-storming-recovery-v0.6.0...event-storming-recovery-v0.7.0) (2026-08-05)


### Features

* bound get_flow/bundle source grounding with a default cap ([#59](https://github.com/bhastings-t3/event-storming-recovery/issues/59)) ([b44ee3b](https://github.com/bhastings-t3/event-storming-recovery/commit/b44ee3ba34c29e5f8d69d0c30be4deda77482f54))
* expose includeSource on get_node/get_flow MCP tools ([#57](https://github.com/bhastings-t3/event-storming-recovery/issues/57)) ([83649e9](https://github.com/bhastings-t3/event-storming-recovery/commit/83649e956e84b6c27c65040946751380cc6e7355))
* **view-server:** enforce loopback-only origin/host and scope source reads ([#25](https://github.com/bhastings-t3/event-storming-recovery/issues/25)) ([07942e6](https://github.com/bhastings-t3/event-storming-recovery/commit/07942e6ef4b8e5d790af3ca06fa1d0b4d4486c25))


### Bug Fixes

* create generate output dir instead of erroring when absent ([#51](https://github.com/bhastings-t3/event-storming-recovery/issues/51)) ([49b3c5d](https://github.com/bhastings-t3/event-storming-recovery/commit/49b3c5d07a6d248b30ee20d747ee5612f33e196e)), closes [#50](https://github.com/bhastings-t3/event-storming-recovery/issues/50)
* **explorer:** scope the Glossary to domain verbiage, not physical/rule nodes ([#60](https://github.com/bhastings-t3/event-storming-recovery/issues/60)) ([b62c13c](https://github.com/bhastings-t3/event-storming-recovery/commit/b62c13cc4bb667b4b4643eb05e260365c4bd7a89))
* **fs:** make comment sidecar write atomic and report durability ([#26](https://github.com/bhastings-t3/event-storming-recovery/issues/26)) ([0c18214](https://github.com/bhastings-t3/event-storming-recovery/commit/0c18214d3e43ccdfa219eb8f1e593faaef01219a))
* harden es-view server against three reachable robustness bugs ([#44](https://github.com/bhastings-t3/event-storming-recovery/issues/44)) ([5c22024](https://github.com/bhastings-t3/event-storming-recovery/commit/5c22024aeb28203f124abeeefc1844760c3a39ca)), closes [#12](https://github.com/bhastings-t3/event-storming-recovery/issues/12)
* harden server/resolve against port, discovery, and repoRoot papercuts ([#48](https://github.com/bhastings-t3/event-storming-recovery/issues/48)) ([e5c55b4](https://github.com/bhastings-t3/event-storming-recovery/commit/e5c55b4620656f5df0a193ce3c3ff0d531febd8f))
* make committed example OS-neutral and guard against demo drift ([#46](https://github.com/bhastings-t3/event-storming-recovery/issues/46)) ([6208a5b](https://github.com/bhastings-t3/event-storming-recovery/commit/6208a5b3b931da5ff110183512da7deba144768c)), closes [#45](https://github.com/bhastings-t3/event-storming-recovery/issues/45)
* make committed explorer/flows.dot source links portable ([#29](https://github.com/bhastings-t3/event-storming-recovery/issues/29)) ([0a73788](https://github.com/bhastings-t3/event-storming-recovery/commit/0a737882c7cc421016012ae2e6ccdd4128014560)), closes [#88](https://github.com/bhastings-t3/event-storming-recovery/issues/88)
* make model validation a hard boundary on every write/serve path ([#23](https://github.com/bhastings-t3/event-storming-recovery/issues/23)) ([c613ffe](https://github.com/bhastings-t3/event-storming-recovery/commit/c613ffe05ab4d05eb0966109ea173f06e19b15d2)), closes [#8](https://github.com/bhastings-t3/event-storming-recovery/issues/8)
* render nested and loose data-model fields to match the count ([#11](https://github.com/bhastings-t3/event-storming-recovery/issues/11)) ([#56](https://github.com/bhastings-t3/event-storming-recovery/issues/56)) ([9036c3b](https://github.com/bhastings-t3/event-storming-recovery/commit/9036c3be75a61ff65e4dd8d07d0b441c86bee455))
* surface copy failures on empty/failed clipboard writes ([#43](https://github.com/bhastings-t3/event-storming-recovery/issues/43)) ([afb2956](https://github.com/bhastings-t3/event-storming-recovery/commit/afb2956c0b1ec2faf5b13079b8a6606c6fac2d94))

## Changelog
