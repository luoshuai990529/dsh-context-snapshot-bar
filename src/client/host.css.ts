/**
 * The only hand-written stylesheet in this plugin: how the prototype's cards
 * sit inside the host.
 *
 * Everything the cards look like comes from `styles.ts`, which is generated
 * from the prototype; these rules are the seams between that drawing and the
 * product — the column body has to fill the pane the host gives it, the composer
 * row has to take the composer card's own width, and the snapshot card's digest
 * has to read as a separate block from the raw record under it. The width is
 * read from the host's `--dsh-composer-card-max-width`, the same variable the
 * input card caps itself with, so the row tracks the input at every viewport.
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

.dsh-context-snapshot-bar .digest-text {
  margin: 0;
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.dsh-context-snapshot-bar .digest-note {
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.5;
}
`
