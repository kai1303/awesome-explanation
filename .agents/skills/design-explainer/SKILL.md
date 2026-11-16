---
name: design-explainer
description: Use when a topic needs research and a learner-facing article for an interactive explanation, or when an existing explainer needs a clearer step-by-step walkthrough.
---

# Design an explainer

Deliver the text a learner will actually read on the page. It should make sense with the diagram covered. When the reader uncovers it, they should recognize the example, predict an outcome, and check their reasoning. The [Transformer Explainer article](https://poloclub.github.io/transformer-explainer/) shows this progression from an overview to a worked computation.

## Research the mechanism

1. Identify the reader, what they already know, and a question they should be able to answer about a *new* input after reading. If the audience is unspecified, assume a curious newcomer and explain the necessary prerequisites.
2. Read primary sources. Find where the mechanism was introduced and where its concrete behavior is specified or implemented. Track which source supports each important claim, which details vary by implementation, and which assumptions the example makes.
3. Work one small input all the way through. Record the starting state, the rule at each decision, intermediate values and the result. If a diagram exists, check its actual starting state and replay the operations. Fixtures, screenshots and the live example can start from different states.
4. Decide what the reader needs in order to explain that trace. Introduce prerequisites where they unblock the next step. Save variations and optimizations for the question they help answer. A fact earns space when omitting it would leave a causal gap or lead to a wrong prediction.

## Write the article

Open with a concrete puzzle and the reason the mechanism exists. Give the reader a short map of the whole process before zooming in. Use headings that name the question or operation, in the order a learner needs them.

Carry one identifiable thing across the sections. At each consequential step, explain what triggers it, which rule applies, what changes, and why that leads to the next step. Show actual values at the decision point. Slow down wherever two plausible answers diverge. Introduce a term in the sentence where the reader first needs it.

Give the reader one changed condition to reason about. Ask for a prediction before revealing the outcome and explain why it follows. Tie observations to controls that actually exist. Use a caption, equation or table when it makes an intermediate state easier to see.

Deliver finished paragraphs, meaningful headings, and source links near the claims they support. For an existing topic, use its article format in place. For a design-only request without a page, return publishable Markdown. Keep any requested implementation notes outside the learner's text.

## Hand each lesson to the diagram builder

Alongside the manuscript, draw one wide chart for the whole worked example. Sketch the stages from left to right, from the request to its result. Name the stages using the article’s vocabulary and draw the relationships the learner needs to see inside and between them. Keep those landmarks in the same places across lessons. Use the [B+ tree chart](../../../topics/b-plus-tree/index.html#diagram) as the layout reference.

Give the builder the walkthrough, movement plan and stage copy alongside that sketch.

- **A walkthrough for each article anchor.** Name the starting state, the question, the learner’s action and the visible evidence that answers it.
- **A movement plan for the GSAP timeline.** Write one row per handoff between model states, including repeated steps within a stage and any different route in the variation. Identify the labeled key, record version or pointer that moves. Name its exact source, destination and path. Describe what stays at the source, what the learner sees during travel, and which fact the destination reveals on arrival. For a comparison that moves nothing, specify the values to highlight in place. Use the same labels and endpoints for the reduced-motion view.
- **Popover copy for every stage, including input and result.** Give each a title, explain what the stage receives, which rule it applies and what it passes on or retains. Work through the actual values in one frame. Identify the values the builder must fill from the current run, the related article anchor, and what the popover says before that stage has run. A learner opening it early should still be able to make the lesson’s prediction.

For example, the B+ tree lesson asks “Which key will the new leaf advertise to its parent?”

| Decision and trigger | Item and route | What the learner sees, in order |
| --- | --- | --- |
| Split the overflowing leaf | Records 35, 40 and 50 move from leaf B into the sorted rows of new leaf C. | Keep 20 and 30 in B. Let the learner follow 35 first, then 40 and 50. Show the resulting leaf link and leave the parent update for the next step. |
| Choose the separator | A copy of C’s first key travels from its leaf row to the new separator in the root. | Keep record 35 visible in C as the copy travels. At arrival, show that the root now routes keys ≥ 35 to C. |

The root popover explains why equality follows the new pointer. Bind its boundary and the moving label to the new leaf’s first key so they agree when the input changes.

Distinguish quantities the model computes from illustrative marks. Decide which details the overview needs, which a reader can inspect, and what should stay in view as the lesson advances. Transformer Explainer authors its long article separately from its guided pages. Each guided page identifies the diagram elements it needs when the reader enters and leaves. [Upstream lesson definitions](https://github.com/poloclub/transformer-explainer/blob/bfe50afba10b9b560b84143ee1107d977defa74f/src/utils/textbookPages.ts#L125-L185)

## Check the manuscript

Read it once without the controls. Could a newcomer reconstruct the example and explain why the result follows? Then trace the example and its variation against the source or simulator. Fix mismatched names, values, steps, and any statement that accidentally describes a teaching simplification as a universal rule.

Walk a finger along the chart for both inputs. From each row of the movement plan, could the builder place the item at departure, halfway along its path and at arrival? Check what the learner can predict before each reveal, then read the popover against the values visible in that frame.

Worked example in this repository: [How an LSM tree stores two values for one key](../../../topics/lsm-tree/index.html#how-it-works).
