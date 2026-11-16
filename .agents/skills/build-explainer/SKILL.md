---
name: build-explainer
description: Use when turning a researched explainer article into a working interactive diagram that lets readers trace the mechanism, inspect decisions, and experiment with another input.
---

# Build an interactive explainer

Use the manuscript from [design-explainer](../design-explainer/SKILL.md) as the input. Read it in full. If the request supplies only a topic, use that skill to write the article first. Deliver the working diagram alongside the article. In this repository each topic has a page at `topics/<slug>/index.html` and an entry in the README.

## Translate the article into states

Trace its worked example on paper. For each decision, identify the input, relevant state before and after, rule, and observation that lets a learner verify the rule. Map each major article passage to a reachable diagram state. Keep the manuscript’s vocabulary, units, values, and simplifications. Resolve discrepancies against its primary sources before implementing.

Use the design handoff’s stage sketch, movement plan and popover copy. If an older manuscript lacks them, derive them from its worked example. Build one wide, left-to-right chart. Place direct operations in the Client stage when the example accepts requests, with playback controls beside the operation. Put the current lesson and operation trace below. Keep stage positions stable as the learner steps. Draw the actual structure inside each stage, such as a sorted file and its Bloom filter, and connect the specific entries involved in a handoff. On narrow screens, let the chart scroll horizontally and keep the active item in view. The [LSM record flow](../../../topics/lsm-tree/index.html#viewport) shows the layout. Use the [shared design system](../../../design-system/README.md) for controls and chart styling.

## Implement the mechanism

Start with the article’s example loaded. Compute the sequence from the actual input with a small domain model. Each yielded step or snapshot should contain enough state to draw the diagram and explain the decision. Generate the highlights, captions and result from that trace. Keep old frames stable so stepping backward restores the exact earlier state. Test the deciding rule with the article’s numbers and a changed input that takes a different branch.

### Animate each handoff with GSAP

Use a `gsap.timeline()` for each forward step that has movement. Read the outgoing and incoming snapshots together and implement the corresponding row of the movement plan. Run and Next should play the same sequence.

1. **Locate the item.** Match its stable model identity across snapshots, including the version when several records share a key. Measure its source before updating the chart and its destination after layout, in the same coordinate system. Keep the label legible throughout travel.
2. **Show the route.** For a curved handoff, draw the active SVG ribbon and move the labeled item along that same path using GSAP’s `MotionPathPlugin`. For a record changing rows, use `fromTo` to move the destination row from its measured source offset into place. Update connectors during layout motion. A copy leaves its original visible. A probe moves the comparison pointer carrying the key label while resident keys stay in place.
3. **Reveal the consequence.** Place the destination’s comparison, write or routing decision on the timeline at arrival. For a batch, stagger the records enough to follow one label. For a stationary comparison, emphasize the two values in place. Derive the next frame from the model so a learner can reach it at any playback speed.

Follow the LSM chart’s `captureInputs` and `animateInstall` for measured, staggered record transfers. Reuse `drawRibbon` from the shared helper for a path sweep. The hash table shows how to pass the same curve to the moving key. [LSM record transfers](../../../topics/lsm-tree/diagram/chart.js) · [Shared GSAP helpers](../../../topics/chart-motion.js) · [Hash table probe path](../../../topics/hash-table/main.js)

On Back, reset, a new input or an article jump, clear the old timeline and temporary styles before showing the requested snapshot. Opening a stage popover pauses playback on a coherent step. With reduced motion, render that step immediately with the labeled endpoints, selected connection and result visible.

Give every stage a discoverable, labeled popover trigger, including the input and result. Populate the popover from the current snapshot and the author’s stage copy. Show what arrived, the rule applied to those values, and what changed or will be checked next. Link to the related article passage. Pause playback on inspection and keep the selected stage and key visible. Support click, tap and keyboard activation, Escape and a close button. Return focus to the trigger on dismissal and let the learner resume from the same step.

Let the learner run, pause, advance, go back, and reset. Include an editable input or meaningful alternative scenario. Make clear whether an experiment starts afresh or continues the previous one. Connect article passages to their corresponding states and preserve a route back to the text.

## Connect a lesson to its evidence

Read the design handoff for each article anchor. Bind the lesson to the model state immediately before its decision. On entry, bring the relevant stage and tracked item into view and ask the learner to act on it or make a prediction. Offer an accessible way to reveal the answer. If a prediction misses, point to the evidence they can inspect and let them try again.

Use one diagram for the overview, the guided action and the result. Drive its values, correct answer and highlights from the current run. A lesson may span several model snapshots. Show the consequence on the diagram, including any relationship that changed, and explain why it answers the question. Label illustrative encodings if a reader might interpret them as computed measurements.

Define what happens on entry, reveal and exit. Clear old feedback, pending actions and highlights when the reader goes back, follows an article link or changes input. Preserve context that the next lesson still needs. Transformer Explainer uses page entry and exit handlers to coordinate its views. A local mapping from lesson and model phase to view state works too. [Upstream textbook navigation](https://github.com/poloclub/transformer-explainer/blob/bfe50afba10b9b560b84143ee1107d977defa74f/src/components/textbook/Textbook.svelte#L13-L35)

## Verify from the page

Run the article’s example in the actual browser. Compare each distinct transfer with its movement-plan row. Watch the labeled key leave its source, inspect it mid-transfer against the route, and check what appears on arrival. Interrupt a transfer with Back or reset and wait past its original duration to catch a late reveal. Step through with reduced motion and verify the same destination, values and outcome. Open every stage’s popover and compare its rule and values with the visible frame. Try a stage before it runs. Change the input and check that the route, animation, popovers and result follow the new trace.

Check a boundary, a wrong prediction and retry, previous/next, reset, and jumping directly from each passage to its unanswered question. On a narrow screen, follow the key across the chart and open its stage detail. With the keyboard, close the detail and continue from that step. State which cases you actually verified.

Worked example: [LSM tree](../../../topics/lsm-tree/index.html). Follow two versions of cedar through memory and disk, then inspect which version a read returns.
