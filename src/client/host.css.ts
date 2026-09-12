/**
 * The only hand-written stylesheet in this plugin: how the prototype's cards
 * sit inside the host.
 *
 * Everything the cards look like comes from `styles.ts`, which is generated
 * from the prototype; these three rules are the seams between that drawing and
 * the product — the column body has to fill the pane the host gives it, and the
 * composer row has to take the composer card's own width. The width is read
 * from the host's `--dsh-composer-card-max-width`, the same variable the input
 * card caps itself with, so the row tracks the input at every viewport.
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
`
