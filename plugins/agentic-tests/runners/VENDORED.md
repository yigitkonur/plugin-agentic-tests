# Vendored runner documentation

Copied from the author's skills by scripts/vendor-runners.sh on 2026-10-21. Do not edit here; edit the source skill, run the script, then rebuild (node scripts/build.mjs).

| Runner | Upstream | Source skill |
|---|---|---|
| ego-browser | https://github.com/citrolabs/ego-lite (MIT, Copyright (c) 2026 CitroLabs; full text in LICENSE-ego-lite) | ~/.agents/skills/ego-browser |
| test-by-mcpc-cli | https://github.com/yigitkonur/skills-by-yigitkonur/tree/main/skills/test-by-mcpc-cli | ~/.agents/skills/test-by-mcpc-cli |
| test-by-maestro | https://github.com/yigitkonur/skills-by-yigitkonur/tree/main/skills/test-by-maestro | ~/.agents/skills/test-by-maestro |

```text
3e42eeee2ad8f14cd6784f7bf03e81bd52e4cc01ecb7835cac7246402d21f8ec  ego-browser/references/api.md
c9a022df55f396607ec8b7dc486ab452f1a133fd04fd954a2ff3f86c4df9458c  ego-browser/references/clearing-state.md
3aa505f500fa26b8cbdb5279e5caa9f73aa6590107db280b6da2f2a1ba57d521  ego-browser/references/install.md
6916b7906302639a115b035ff7045e8f01de0a916cd274172620e4f10c2a20e5  ego-browser/SKILL.md
87173b705cd125bf6d90e79d685c2bded485796d9f56e3ae6aa588768443f0ac  test-by-maestro/references/commands/cli-and-artifacts.md
252193727ba8060cb3c6f35253fead0c87530b31e68b1f235226af9561916b75  test-by-maestro/references/commands/flows-and-selectors.md
637cb4248bc7b8c5ea4055073af26e953787da54ace3bd731161bdae03ebfdbf  test-by-maestro/references/guides/android-and-local-ios.md
427d19a7af3eacca2b5b469b1a1427f0b6738cdafc6f8a9d69d13c1007fc34c8  test-by-maestro/references/guides/graaljs.md
f2b0e5748342796193c8da56d92baa3e06207773cc0bfbdb4eba9f92eb21be75  test-by-maestro/references/guides/ios-over-ssh.md
75bc2a7a869508306d51898cf6f7bbef50e54ad7dc373fa3557c06347bf539b1  test-by-maestro/references/patterns/suites-and-ci.md
8633d7480cacb6f6909623e977cbb3ae555e91c11cb31e6d35009de1ef44e664  test-by-maestro/references/troubleshooting/expo-and-state.md
ba5528b90f8bf67a41d4fc1e251419d505a5f25a9875930a0c075f58f646337d  test-by-maestro/references/troubleshooting/mobile-flakiness.md
65491eb305a919311dd082a02bb8955b07c251018f76f9ca80a6377a25a73bde  test-by-maestro/SKILL.md
9501279c32a517bad20d3f22e1697447da548e917fda4ddcfe820468acc3b973  test-by-mcpc-cli/references/commands/quick-reference.md
f7b7a3a0e4c013487dc0ff1471417e3c60a85988e26efd3843168473f7ec1e6f  test-by-mcpc-cli/references/examples/real-world-workflows.md
693fa36d4d755a209ef425a014b1f93f987fec60d25051cd2e15cdd199bf393f  test-by-mcpc-cli/references/examples/testing-recipes.md
4ee318ceed71d6d637c6f30c60c1caca6462328a53dc0e5533d3e82d411409df  test-by-mcpc-cli/references/guides/architecture.md
5730f3a1f347cbcd16fc2afe1d62af8a0ce44d84b4c7b950a6e18f309ef9aaa3  test-by-mcpc-cli/references/guides/async-tasks.md
53acbbe04455a4b0b54148638cec6753275562c18ac794a89c50e471a833c33a  test-by-mcpc-cli/references/guides/authentication.md
b14da5e8bfbd162b22c2cd6f0bb5683e6fcfcd440b74c154f4c9d560bc09af69  test-by-mcpc-cli/references/guides/bridge-internals.md
6eeb80b7363ab67f3cb567f7d71c3cc491b1b3285ef99e5f4f66b88657dad363  test-by-mcpc-cli/references/guides/capability-coverage.md
c3e5dcfb10bef90d3c421350cb90cf2adac35f8843a9831f3ac5c5c262948281  test-by-mcpc-cli/references/guides/ci-cd-integration.md
f2cc85f520ecb1634d8ef4632d6fc72f13b9c7e015a9407c1e43279305de0b4f  test-by-mcpc-cli/references/guides/cleanup-maintenance.md
5fd4ceba9e300b7f63892dd9c8018c13b370ca606badee8c38ed62e7795e38bb  test-by-mcpc-cli/references/guides/discovery-search.md
ee3c4468c149581245517c0d7dbaa40669ae76e8c5479022be2084f9d515a051  test-by-mcpc-cli/references/guides/everything-server.md
b37528c9b6e6a261608f6466ab744d36b39d692412d3e403735770005ba146a6  test-by-mcpc-cli/references/guides/http-testing.md
d9147b58b9424c0c00d56b41d96452e45d6222eaf1311c87fe6b45ef58d6aec7  test-by-mcpc-cli/references/guides/installation.md
2cd87b41469b64d13b5c7e130e5b46b30c0581aad694eb40dba00d90d5117009  test-by-mcpc-cli/references/guides/protocol-versions.md
e336f4defe475287b8784839b543166a90362eb9336e2ba9d58d7f42355dde94  test-by-mcpc-cli/references/guides/proxy-testing.md
88ba16f9b16caaccc78273452d02fb7dd0d305268274c5a42b5679b915fdd79b  test-by-mcpc-cli/references/guides/scripting-automation.md
38c62ceff10086a6527c6b18eba3628a7e488ae46802499577b24297b94653e4  test-by-mcpc-cli/references/guides/session-management.md
ff57b70d21c99645bd89097886ce8a3b953342bb3128f795b8e893adc0b880fb  test-by-mcpc-cli/references/guides/skills-testing.md
bba44a8755bd36e57382048f839111ef95d38a51284d0086bb2eba600f0e7de1  test-by-mcpc-cli/references/guides/stdio-testing.md
2465e33cdac69b6fcbc6573b84535cac941cd7196f1c17a0522bb9db6f5f8f21  test-by-mcpc-cli/references/guides/tool-resource-testing.md
52f57a20b7de6897fef0be4e45205eb282ef34d5552ef81c4929bf7edf17971e  test-by-mcpc-cli/references/guides/x402-payments.md
8983ddb3de1812d9ce384b48b3f8f2f99096fac744cd0d10a38933c99c834562  test-by-mcpc-cli/references/patterns/argument-parsing.md
5c7af753f1c028a1179add6f8d5d61b6dfa925056c762f04bbbc6f0c1738d6ae  test-by-mcpc-cli/references/patterns/auth-precedence.md
ae7f6b17333e6f72aa8d525a53a19f73fafadf1ef09d3708bc4f0e37eeb6a893  test-by-mcpc-cli/references/patterns/config-resolution.md
e6489809e122e9071c4f8d2a847731b80e3a4bd5f36a917c7fd9bf084e66e02c  test-by-mcpc-cli/references/patterns/data-model.md
88be0d209aee55a483904f5abe50250c8e0389af669c6e5f9a4d4d67481b5df4  test-by-mcpc-cli/references/patterns/jq-patterns.md
a0d1a05cf74bc481dc9c0d7490c0a475810180624bc2ef441bcbfc2e2ef95e9a  test-by-mcpc-cli/references/patterns/logging-debugging.md
682b269b49ec087c72b069f87bf2427862c6623feff7f33a6a14fbc3fee1c746  test-by-mcpc-cli/references/patterns/notification-handling.md
7775449af0246509bb9dc18a1f5163777b2710054ceb288b5731c61c9bbf3cfe  test-by-mcpc-cli/references/patterns/output-formatting.md
83cb9adf75e6677fb6eb44b22c82ffcf4833c8aaa42242ef5a342cfd5131064f  test-by-mcpc-cli/references/patterns/pagination-caching.md
e355301440a54d15e6ac1b0b8436f7e3935110c8bd3ea73a038d998572bcbfc4  test-by-mcpc-cli/references/patterns/python-integration.md
a4acd2c21c0b4ad4b29114e2168c870918ed709952832359bdfb8cc696d1a671  test-by-mcpc-cli/references/patterns/schema-validation.md
af7b539f81db705ca4a3fc3752d8b30311a4806b4b9114ae8cb02a32bdbaf6e4  test-by-mcpc-cli/references/patterns/session-first-syntax.md
c2ae11ff765cf747c3694501983adebd690c5a7180b20a8c9751de85bed057e8  test-by-mcpc-cli/references/patterns/tool-filtering.md
53b45b9c2e67648b5dfc0d2bc1c4c829a78797d0a5dfe1a04c2b44169a0f2844  test-by-mcpc-cli/references/troubleshooting/common-errors.md
4a6c2d949b888873f409b8b4b9c4158c5d3309d9d6e849f124934682ae766c69  test-by-mcpc-cli/SKILL.md
```
