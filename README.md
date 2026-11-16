# Awesome Explanation [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

Interactive explanations of data structures and database engines. Step through an operation, follow a key across the diagram, and click a stage to inspect the calculation behind it.

**[Watch the Bloom filter hash each letter of juniper](https://kai1303.github.io/awesome-explanation/topics/bloom-filter/?mode=query&query=juniper#key-hash)**

## Contents

- [Databases](#databases)
- [Data structures](#data-structures)
- [Contributing](#contributing)
- [Run locally](#run-locally)

## Databases

- [Log-structured merge tree (LSM tree)](https://kai1303.github.io/awesome-explanation/topics/lsm-tree/)

<details>
<summary>Try a lookup, a merge, or crash recovery</summary>

- [Follow a juniper lookup](https://kai1303.github.io/awesome-explanation/topics/lsm-tree/?demo=bloom). Inspect each SSTable’s Bloom filter to see why the engine skips one file and checks another.
- [Compare compaction policies](https://kai1303.github.io/awesome-explanation/topics/lsm-tree/?demo=juniper). Switch between size-tiered and leveled compaction to see which files each policy merges for the same writes.
- In the Client column, click a SQL row to run it. Click **Crash** before a flush, then **Restart** to watch the write-ahead log rebuild the memtable.

</details>

## Data structures

- [Bloom filter](https://kai1303.github.io/awesome-explanation/topics/bloom-filter/) — Insert words into a bit array and test set membership. In **Insert**, follow each word to the two bits it sets. In **Query**, compare `juniper` (inserted), `cedar` (definitely absent), and `teak` (a false positive). Click **Hash function** to watch the running hash change with each letter. For `juniper`, the final hash is `0x3F20DCD0` and selects bits 0 and 13.

- [Hash table with linear probing](https://kai1303.github.io/awesome-explanation/topics/hash-table/) — Follow key 17 past two occupied slots, then fill the last slot to see the probe wrap around.

## Contributing

Have a question that belongs in the diagram? [Suggest an explanation](https://github.com/kai1303/awesome-explanation/issues/new) with the question, one interaction that would help someone answer it, and a concept it could connect to. For example, a filesystem journal could connect to the LSM tree through the question “What survives a crash?”

To add a working explanation, open a pull request with a link under its topic and one sentence describing what readers can try. Add a topic heading and a Contents link when an explanation introduces a new subject.

### Add an explanation

Use the repository skill [design-explainer](.agents/skills/design-explainer/SKILL.md) to research the mechanism and write the article readers will see alongside the diagram. The [LSM tree walkthrough](https://kai1303.github.io/awesome-explanation/topics/lsm-tree/#how-it-works) follows one key from its first write through a flush, a merge, and crash recovery.

Use the [explainer design system](https://kai1303.github.io/awesome-explanation/design-system/) for page layout, record rows, command controls, color roles, and motion. The [implementation guide](design-system/README.md) shows what to import.

Then use [build-explainer](.agents/skills/build-explainer/SKILL.md) with that article to build the interactive diagram. The [LSM article](topics/lsm-tree/index.html#update) links its cedar example to the corresponding read in the diagram.

Each explanation lives in `topics/<slug>/`. The slug is its URL, so use a name that can stay the same even if its category in this README changes.

1. Create `topics/<slug>/index.html` and load the topic’s JavaScript with a relative module script. Keep its styles, simulation, and `*.test.js` files in that folder. The [LSM tree](topics/lsm-tree/) keeps its drawing code in `diagram/`.
2. Link to the topic from this index. When two explanations share a concept, link directly from one topic page to the other using `../<other-slug>/`.
3. Run `npm test` and `npm run build`. Tests and topic pages are discovered automatically. The existing Pages workflow publishes every built page.

## Run locally

Use Node.js 22.12 or later and npm.

```sh
git clone https://github.com/kai1303/awesome-explanation.git
cd awesome-explanation
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm test` for the topic tests or `npm run build` to create the static site in `dist/`.

The ribbon chart adapts work from the Polo Club of Data Science’s [Transformer Explainer](https://github.com/poloclub/transformer-explainer). See the [upstream MIT license](public/transformer-explainer-LICENSE.txt).
