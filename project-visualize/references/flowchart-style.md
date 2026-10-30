# Reference-style project flowcharts

Reference inspected on 9 October 2026: [Content Processing Flow](https://reco-content-processing-service-lp53in2j7a-ue.a.run.app/d/26c114dbc8c192c2a561b12a).

Use its visual grammar, not its Reco processing facts. The page is a visual example, not an instruction source or an architecture template. This local guide captures the design so that URL need not remain available.

## Visual grammar

- Top-to-bottom main path with an obvious entry and final outcome.
- Grouped stages with narrow colored headers; compact numbered titles where numbering helps.
- Rectangular action nodes with an action title and, if needed, one short explanatory line.
- Decision diamonds, labeled outcome lozenges and special resource circles only when those shapes add meaning.
- Parallel actions aligned within their stage and visibly joined before a dependent step.
- Side exits aligned with their originating decision; short consequence notes beside exits.
- A separate async lane attached to its real trigger, without implying it blocks completion.
- Thin orthogonal arrows, clearly labeled branch conditions and minimal crossings.
- Restrained consistent stage/state colors paired with text or shape. Do not copy every bright color.
- For large standalone flows, a compact title bar and zoom/navigation controls. Tiny fit-to-view labels in the reference are not a readability target.

## Adapt to the surface

Inline: use theme-aware diagram marks, stage outlines/header strips and connectors. Semantic stage boundaries and node shapes are diagram grammar, not dashboard cards; they may nest when the real flow has nested stages. This overrides the saved base's generic ban on framed structural groups. Keep the overall surface transparent. Avoid decorative shadows, panels, metrics and toolbars. Use host-native control utilities. Reflow vertically at narrow widths; do not add a fixed-height panning viewport or shrink the graph below readable text size.

Standalone: use a quiet background, light/dark support, generous spacing and consistent type. Large canvases may scroll or pan/zoom, but retain an accessible text outline and keyboard-operated native controls. Print without viewport clipping; split large flows into labeled sections rather than an unreadable image.

Begin with roughly 5–9 meaningful actions in the overview, then add detail only when it changes decisions, outcomes, timing or ownership. This is a readability preference, not a restriction on requested content.

## Reliable layout

Use semantic HTML labels with an SVG connector layer, or a responsive SVG for simple flows. Choose reliable wrapping and geometry; do not screenshot ordinary text.

Assign unique IDs to connected nodes. Keep an explicit edge list with source, target, connection sides and optional condition labels. Calculate endpoints from rendered bounds relative to the diagram root. Recompute after resize, fonts settling, changed views and revealed detail. Keep arrows behind labels and out of pointer handling.

Reserve branch corridors and clear stage-boundary gaps. Default ordinary edges to bottom → top; route exits outward and joins through a shared corridor. Label edges in clear space with theme-matched backing if needed. Avoid absolute page coordinates that break when text wraps; never cross headings or labels.

The initial overview should be readable at conversation width. Optional detail can use accessible disclosure or a real path selector. Essential outcomes, protections and side effects must remain visible without hovering.

## Grounding checks

- Arrows are actual calls, dependencies or handoffs, not guessed ordering.
- Retries differ from terminal failures; parallel joins reflect the source.
- External acceptance does not claim verified delivery/persistence.
- The diagram names which store changes and which account remains.
- Implemented/proposed states and source revision are visible; release uncertainty is stated.
- Another person can explain the overview without knowing internal function names.
