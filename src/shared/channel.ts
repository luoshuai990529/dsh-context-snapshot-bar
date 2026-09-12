/**
 * The digest channel both halves name: the Host serves the endpoint on this
 * logical channel, and the Client calls it through the Connection transport.
 *
 * @module dsh-context-snapshot-bar/shared/channel
 */

/** Logical channel the snapshot digest is served on. */
export const SUMMARY_CHANNEL = '/context-snapshot-bar'

/** Endpoint within {@link SUMMARY_CHANNEL} that answers one digest request. */
export const SUMMARY_ENDPOINT = 'snapshot-summary'
