# Awesome Explanation

**[Explore the live diagram](https://kai1303.github.io/awesome-explanation/)**

Awesome Explanation is growing into one connected, interactive diagram of how things work. The first part is a log-structured merge tree (LSM tree). You can already follow a single write from memory to disk and see how a later read finds it.

As the diagram grows, a concept in one explanation can become the entry point to another. Follow a write into the log, for example, and a natural next question is “What survives a crash?” A future explanation of crash recovery could connect that same log to a filesystem journal. The aim is to let questions like this take you across topics, wherever you started.

## Start with the LSM tree

The example opens after eight writes and two flushes. The key `cedar` has been written twice. Try these operations in order to see what happens to both versions.

1. Choose **Read**, leave the key as `cedar`, and run it. The read finds `jade` in the memtable and stops. Hover over or focus a `cedar` record to trace it across the diagram and find the older `sage` version on disk.
2. Run **Flush**. Watch the engine freeze the memtable, install its sorted records in a new disk table, and retire the write-ahead log. Read `cedar` again. You still get `jade`, this time from disk.
3. Run **Compact**. Follow both versions of `cedar` into the merge. The new table keeps `jade` and drops `sage`. A read returns the same value even though there is now only one copy of the key.

Choose **Write** to try your own keys and values, or **Reset example** to return to the starting state. The simulation runs in your browser.

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
