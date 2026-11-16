# Awesome Explanation [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

An index of interactive explanations that grow into one connected diagram. Each entry starts with a question you can explore by changing something and watching what happens. The LSM tree is the first topic. Its write-ahead log is one way the diagram can grow from databases into crash recovery and filesystems.

**[Explore the live diagram](https://kai1303.github.io/awesome-explanation/)**

## Contents

- [Databases](#databases)
- [Contributing](#contributing)
- [Run locally](#run-locally)

## Databases

- [Log-structured merge tree (LSM tree)](https://kai1303.github.io/awesome-explanation/) — Write two values for the same key and follow both versions through memory and disk to see which one a read returns.

<details>
<summary>Try it with the example key <code>cedar</code></summary>

The example opens after eight writes and two flushes. The key `cedar` has been written twice. Try these operations in order to see what happens to both versions.

1. Choose **Read**, leave the key as `cedar`, and run it. The read finds `jade` in the memtable and stops. Hover over or focus a `cedar` record to trace it across the diagram and find the older `sage` version on disk.
2. Run **Flush**. Watch the engine freeze the memtable, install its sorted records in a new disk table, and retire the write-ahead log. Read `cedar` again. You still get `jade`, this time from disk.
3. Run **Compact**. Follow both versions of `cedar` into the merge. The new table keeps `jade` and drops `sage`. A read returns the same value even though there is now only one copy of the key.

Choose **Write** to try your own keys and values, or **Reset example** to return to the starting state. The simulation runs in your browser.

</details>

## Contributing

Have a question that belongs in the diagram? [Suggest an explanation](https://github.com/kai1303/awesome-explanation/issues/new) with the question, one interaction that would help someone answer it, and a concept it could connect to. For example, a filesystem journal could connect to the LSM tree through the question “What survives a crash?”

To add a working explanation, open a pull request with a link under its topic and one sentence describing what readers can try. Add a topic heading and a Contents link when an explanation introduces a new subject.

## Run locally

Use Node.js 22.12 or later and npm.

```sh
git clone https://github.com/kai1303/awesome-explanation.git
cd awesome-explanation
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm test` for the storage engine tests or `npm run build` to create the static site in `dist/`.

The ribbon chart adapts work from the Polo Club of Data Science’s [Transformer Explainer](https://github.com/poloclub/transformer-explainer). See the [upstream MIT license](public/transformer-explainer-LICENSE.txt).
