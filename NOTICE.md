Copyright 2026 Tether Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

The prebuilt addon statically links the ripgrep crates `ignore`, `grep-searcher`,
`grep-regex` and `grep-matcher` by Andrew Gallant (https://github.com/BurntSushi/ripgrep),
and the crates `regex`, `serde` and `serde_json`. Each is dual licensed under MIT or
the Unlicense (ripgrep crates) or MIT or Apache-2.0 (the others). `Cargo.lock` pins the
exact versions.
