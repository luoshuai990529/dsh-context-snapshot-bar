/**
 * The only hand-written stylesheet in this plugin: how the prototype's cards
 * sit inside the host.
 *
 * Base card styles come from `styles.ts`, which is generated from the prototype
 * of record; the rules here are the seams between that drawing and the product,
 * plus the runtime-snapshot node, whose amber palette comes from the v6
 * prototype and is transcribed by hand because the generated sheet still tracks
 * the visually-verified v5 file. The column body has to fill the pane the host
 * gives it, the composer row has to take the composer card's own width, and the
 * snapshot card's digest has to read as a separate block from the raw record
 * under it. The width is read from the host's
 * `--dsh-composer-card-max-width`, the same variable the input card caps itself
 * with, so the row tracks the input at every viewport.
 *
 * @module dsh-context-snapshot-bar/client/host.css
 */

/** Host integration rules, injected as their own style element. */
export const hostCss = `
.csb-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.csb-entry {
  width: 100%;
  max-width: var(--dsh-composer-card-max-width, 900px);
  margin-inline: auto;
}

/* The digest and the record it describes are two answers to "what is in this
   snapshot": one written for a reader, one as DSH stored it. The divider and the
   recessed surface keep them from reading as one list of equally raw facts. */
.dsh-context-snapshot-bar .snapshot-digest {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  background: var(--accent-soft);
}

.dsh-context-snapshot-bar .snapshot-raw {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}

.dsh-context-snapshot-bar .digest-caption {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.02em;
}

/* One item per stored record, so the digest reads as an inventory of the
   snapshot rather than as prose about it. */
.dsh-context-snapshot-bar .digest-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dsh-context-snapshot-bar .digest-item {
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 12.5px;
  line-height: 1.6;
}

.dsh-context-snapshot-bar .digest-item::marker {
  content: '';
}

.dsh-context-snapshot-bar .digest-note {
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.5;
}

/* What the Host observed, for a reader who has to tell a missing route from a
   rejected key: monospaced so it reads as a diagnostic, not as the digest. */
.dsh-context-snapshot-bar .digest-detail {
  margin: 0;
  color: var(--danger, #b4232a);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-word;
}

/* The runtime-snapshot node: one amber card per retained record, distinct from
   the blue turns, the green compaction summary, and the grey system anchors.
   Palette from the v6 prototype, including its dark pairing. */
.dsh-context-snapshot-bar .runtime-node {
  padding: 13px 14px;
  border: 1px solid #ead2a3;
  border-left: 3px solid #bb811d;
  border-radius: 8px;
  background: #fff8e9;
  color: #664519;
  min-width: 0;
}

.dsh-context-snapshot-bar .runtime-node-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.dsh-context-snapshot-bar .runtime-node-icon {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.6;
  flex: none;
}

.dsh-context-snapshot-bar .runtime-node-badge {
  font-size: 10px;
  line-height: 20px;
  padding: 0 6px;
  border: 1px solid #e9d5ad;
  border-radius: 5px;
  background: #fffdf7;
  font-weight: 500;
}

.dsh-context-snapshot-bar .runtime-node-meta {
  margin-left: auto;
  color: #896b3b;
  font-size: 11px;
}

/* The record's own digest, capped so one snapshot cannot dominate the track. */
.dsh-context-snapshot-bar .runtime-node-digest {
  font-size: 13px;
  line-height: 1.7;
  margin: 8px 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dsh-context-snapshot-bar .runtime-node-footer {
  font-size: 11px;
  color: #896b3b;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
}

.dsh-context-snapshot-bar .runtime-node-action {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 3px 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dsh-context-snapshot-bar .runtime-node-action:focus-visible {
  outline: 2px solid #bb811d;
  outline-offset: 3px;
}

/* One arrival highlight per newly observed record; hydration and re-expansion
   never play it. */
.dsh-context-snapshot-bar .runtime-arrival {
  animation: runtime-arrive 650ms ease-out both;
}

@keyframes runtime-arrive {
  0% {
    opacity: 0.35;
    transform: translateY(-5px);
    box-shadow: 0 0 0 3px #e8b85a55;
  }
  100% {
    opacity: 1;
    transform: translateY(0);
    box-shadow: 0 0 0 0 transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dsh-context-snapshot-bar .runtime-arrival {
    animation: none;
  }
}

@media (prefers-color-scheme: dark) {
  .dsh-context-snapshot-bar .runtime-node {
    background: #302719;
    border-color: #69522c;
    border-left-color: #d5a34b;
    color: #f1d299;
  }

  .dsh-context-snapshot-bar .runtime-node-badge {
    background: #3c301d;
    border-color: #69522c;
  }

  .dsh-context-snapshot-bar .runtime-node-meta,
  .dsh-context-snapshot-bar .runtime-node-footer {
    color: #c8ac7d;
  }
}

@media (max-width: 480px) {
  .dsh-context-snapshot-bar .runtime-node {
    padding: 11px;
  }

  .dsh-context-snapshot-bar .runtime-node-meta {
    margin-left: 25px;
    width: 100%;
  }
}

`
