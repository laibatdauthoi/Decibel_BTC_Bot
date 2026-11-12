import {
  enrichDecibelActivityFillV1,
  type activity_ledger_evidence_v1,
  type activity_intent_evidence_v1,
} from './decibel_activity_fill_evidence_v1.js';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import {
  ActivityHistorySchemaV1,
  type activity_history_v1,
} from './decibel_activity_history_schema_v1.js';

export function isRecordedActivityErrorV1(code: string): boolean {
  if (/(?:^|_)(?:WAIT|WAITING|PENDING)(?:_|$)/.test(code)) return false;
  return /(?:^|_)(?:ERROR|FAILED|FAILURE|REJECTED|UNRESOLVABLE|CONFLICT|EXCEPTION)(?:_|$)/.test(
    code,
  );
}

/** Read-only identity mapping. Never infer session ownership from timestamps. */
export function readDecibelActivityHistoryV1(
  path: string,
  sessionId: string,
  ledger?: activity_ledger_evidence_v1,
): activity_history_v1 {
  const empty = {
    sessionId,
    journalAvailable: false,
    errorsComplete: false as const,
    fills: [],
    errors: [],
  };
  if (!existsSync(path)) return empty;
  const Reader = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const fillColumns = new Set(
      (Reader.prepare('PRAGMA table_info(authenticated_fills)').all() as { name: string }[]).map(
        (column) => column.name,
      ),
    );
    const verifiedLineage =
      fillColumns.has('strategy_lineage') && fillColumns.has('external_counterparty')
        ? 'AND f.strategy_lineage=1 AND f.external_counterparty=1'
        : '';
    const intentColumns = new Set(
      (Reader.prepare('PRAGMA table_info(execution_intents)').all() as { name: string }[]).map(
        (column) => column.name,
      ),
    );
    const venueOrderColumn = intentColumns.has('venue_order_id') ? 'i.venue_order_id' : 'NULL';
    const fillRows = Reader.prepare(
      `
      SELECT f.fill_id fillId, f.observed_at timestamp, f.side, f.quantity, f.price,
        i.body_json intentJson, ${venueOrderColumn} venueOrderId
      FROM authenticated_fills f JOIN execution_intents i ON i.intent_id=f.intent_id
      WHERE json_valid(i.body_json) AND json_extract(i.body_json, '$.sessionId')=? ${verifiedLineage}
      ORDER BY f.observed_at DESC, f.fill_id
    `,
    ).all(sessionId);
    const fills = (fillRows as Record<string, unknown>[]).map((row) => {
      const parsed: unknown = JSON.parse(String(row.intentJson));
      const body =
        typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
      const intent: activity_intent_evidence_v1 = {
        ...(typeof body.clientOrderId === 'string' ? { clientOrderId: body.clientOrderId } : {}),
        ...(typeof body.market === 'string' ? { market: body.market } : {}),
        ...(typeof row.venueOrderId === 'string' ? { venueOrderId: row.venueOrderId } : {}),
        ...(typeof body.reduceOnly === 'boolean' ? { reduceOnly: body.reduceOnly } : {}),
      };
      return enrichDecibelActivityFillV1(
        ActivityHistorySchemaV1.shape.fills.element.parse(row),
        intent,
        ledger,
      );
    });
    const blockers = Reader.prepare(
      `
      SELECT CAST(b.id AS TEXT) id, b.observed_at timestamp, b.blocker type,
        b.blocker || ' / Intent: ' || b.intent_id description
      FROM lifecycle_blockers b JOIN execution_intents i ON i.intent_id=b.intent_id
      WHERE json_valid(i.body_json) AND json_extract(i.body_json, '$.sessionId')=?
      ORDER BY b.observed_at DESC, b.id DESC
    `,
    ).all(sessionId);
    const errors = ActivityHistorySchemaV1.shape.errors
      .parse(blockers)
      .filter((event) => isRecordedActivityErrorV1(event.type))
      .map((event) => ({ ...event, id: `blocker-${event.id}` }));
    const tables = new Set(
      (
        Reader.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
          name: string;
        }[]
      ).map((table) => table.name),
    );
    if (tables.has('executor_outcomes')) {
      const outcomes = Reader.prepare(
        `SELECT CAST(o.id AS TEXT) id, o.observed_at timestamp,
        json_extract(o.outcome_json,'$.outcome') type,
        'Executor outcome: ' || json_extract(o.outcome_json,'$.outcome') description
        FROM executor_outcomes o JOIN execution_intents i ON i.intent_id=o.intent_id
        WHERE json_valid(i.body_json) AND json_valid(o.outcome_json)
          AND json_extract(i.body_json,'$.sessionId')=? AND json_type(o.outcome_json,'$.outcome')='text'`,
      ).all(sessionId);
      errors.push(
        ...ActivityHistorySchemaV1.shape.errors
          .parse(outcomes)
          .filter((event) => isRecordedActivityErrorV1(event.type))
          .map((event) => ({ ...event, id: `outcome-${event.id}` })),
      );
    }
    if (tables.has('lifecycle_transitions')) {
      const transitions = Reader.prepare(
        `SELECT CAST(t.id AS TEXT) id, t.observed_at timestamp, t.to_state type,
        'Execution state: ' || COALESCE(t.from_state,'NEW') || ' -> ' || t.to_state description
        FROM lifecycle_transitions t JOIN execution_intents i ON i.intent_id=t.intent_id
        WHERE json_valid(i.body_json) AND json_extract(i.body_json,'$.sessionId')=?`,
      ).all(sessionId);
      errors.push(
        ...ActivityHistorySchemaV1.shape.errors
          .parse(transitions)
          .filter((event) => isRecordedActivityErrorV1(event.type))
          .map((event) => ({ ...event, id: `transition-${event.id}` })),
      );
    }
    errors.sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
    // This journal stores blockers, not every runtime error. Never claim error-log completeness.
    return ActivityHistorySchemaV1.parse({ ...empty, journalAvailable: true, fills, errors });
  } finally {
    Reader.close();
  }
}
