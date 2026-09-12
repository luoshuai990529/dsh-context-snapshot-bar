/**
 * Type-only load of the compaction vocabulary this plugin folds.
 *
 * `compaction/*` members are declaration-merged into `SessionEventMap` by
 * `@deepseek-ai/dsh-compaction/types`, so the fold can only narrow them once
 * that module is part of the program. This plugin reads the events and never
 * imports the compaction implementation.
 *
 * @module dsh-context-snapshot-bar/compaction-events
 */

import type {} from '@deepseek-ai/dsh-compaction/types'
