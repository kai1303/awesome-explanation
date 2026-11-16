# Explainer design system

The [LSM tree](../topics/lsm-tree/index.html) is the reference implementation. Run `npm run dev` and open `/design-system/` for a working Client, lookup, disclosure, and color samples. The example uses the LSM read model and the same command and disclosure components as the reference chart.

## Use it in a topic

Import `../../design-system/explainer.css` first in the topic stylesheet. For a React entry, load the Astryx reset and component styles before the topic styles, as in [LSM controls](../topics/lsm-tree/controls.jsx) and [Bloom filter](../topics/bloom-filter/main.jsx). Keep the domain model, scene layout, and record identities in the topic.

| Part | Shared interface |
| --- | --- |
| Page and title | `.explainer-page`, `.explainer-title`, and an optional `em` for the “Explainer” suffix |
| Diagram | `.chartbar` for title and status, `.legend` for labeled swatches, and a focusable `.flow-viewport` for horizontal scrolling |
| Stage content | `.subtitle` and `.group-name` for units or ordering. Use `.record` with a child `.pin` and a visible text label. |
| Color roles | `.history`, `.log`, `.ram`, `.file`, and `.winner` set `--t` (text), `--light` (row), `--fill` (pin), and `--ribbon` (connection). Use the role whose meaning fits the data. |
| Client | Group related operations in `.client-group`. Import `CommandRow` from `controls.jsx`, pass the Astryx button props and an `active` boolean. A click runs the command. |
| Inspectors | Use `Disclosure` with `label`, `controls` (target ID), `expanded`, and `onClick`. Render a `StagePopover` from `inspectors.jsx` for a stage or individual record. It focuses its heading, keeps the diagram interactive, and dismisses on Close, Escape, or an outside press. Use `CalculationDialog` for a calculation with its own playback or comparison table. Pass `onDismiss(restore)` to close the surface and restore focus to its opener when requested. Both components use Astryx. |
| Reading area | `.footline` for chart instructions, `.notes` for the explanation and trace, and `.walkthrough` for the article. Link a passage to a real example state. |

Use the [GSAP helpers](../topics/chart-motion.js) to animate a handoff along the connection between its actual rows. Label the decision in text, allow inspection during playback, and show the final state immediately with reduced motion. The LSM [record chart](../topics/lsm-tree/diagram/chart.js) shows how to keep one record version identifiable through a batch transfer.

Run `npm test` and `npm run build`. Check the live example and an affected topic at a narrow width after changing a shared primitive.
