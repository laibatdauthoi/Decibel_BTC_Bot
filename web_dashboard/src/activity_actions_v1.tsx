import { SessionModal } from './session_modal_v1';
import { useSessionSharePreviewV1 } from './share_preview_v1';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ActivityHistorySchemaV1,
  type activity_history_v1,
} from '../../src/decibel_activity_history_schema_v1';
import type { ProductionSession } from './main';
import { formatSessionDurationV1, formatOperatorPnlV1 } from './presentation';
import {
  calculateOverviewCostPerMillionV1,
  formatShareCostPerMillionV1,
  type overview_share_data_v1,
} from './overview_share_v1';

const formatValue = (value: number | null, digits = 2, prefix = '') =>
  value === null || !Number.isFinite(value)
    ? 'UNKNOWN'
    : `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function buildSessionShareV1(
  session: ProductionSession,
  observedAt: number,
): { data: overview_share_data_v1; rows: readonly (readonly [string, string])[] } | null {
  if (
    session.startedAt === null ||
    !session.pnlComplete ||
    session.sessionPnlUsd === null ||
    session.totalExecutedVolumeUsd === null ||
    session.fillCount === null ||
    ![
      session.startedAt,
      session.sessionPnlUsd,
      session.totalExecutedVolumeUsd,
      session.fillCount,
      session.configSnapshot.capitalToUseUsd,
      observedAt,
    ].every(Number.isFinite) ||
    session.configSnapshot.capitalToUseUsd <= 0 ||
    (session.endedAt === null && session.status !== 'RUNNING' && session.status !== 'STOPPING') ||
    !Number.isFinite(observedAt)
  )
    return null;
  const target = session.configSnapshot.targetMakerVolumeUsd;
  const targetVolume =
    session.targetSemanticsVersion === 2 ? session.totalExecutedVolumeUsd : session.makerVolumeUsd;
  const progress =
    target < 0
      ? 'UNTIL CAPITAL LIMIT'
      : targetVolume === null
        ? 'UNKNOWN'
        : `${formatValue(targetVolume, 2, '$')} / ${formatValue(target, 0, '$')} | ${formatValue((targetVolume / target) * 100, 1)}%`;
  const data: overview_share_data_v1 = {
    sessionId: session.sessionId,
    status: session.status,
    action: 'Historical Session',
    progress,
    elapsed: formatSessionDurationV1(session.startedAt, session.endedAt, observedAt),
    capital: formatValue(session.configSnapshot.capitalToUseUsd, 2, '$'),
    pnl: formatOperatorPnlV1(session.sessionPnlUsd),
    maxLoss: formatValue(session.configSnapshot.maxLossUsd, 2, '$'),
    target: target < 0 ? 'UNTIL CAPITAL LIMIT' : formatValue(target, 0, '$'),
    volume: formatValue(session.totalExecutedVolumeUsd, 2, '$'),
    observedAt,
    costPerMillion: calculateOverviewCostPerMillionV1(
      session.sessionPnlUsd,
      session.totalExecutedVolumeUsd,
    ),
  };
  return {
    data,
    rows: [
      ['Final Status', data.status],
      ['Duration', data.elapsed],
      ['Capital', data.capital],
      ['Session PnL', data.pnl],
      ['Executed Volume', data.volume],
      ['Fills', formatValue(session.fillCount, 0)],
      ['COST / 1M VOL', formatShareCostPerMillionV1(data.costPerMillion ?? null)],
      ['Target Volume', data.target],
      [
        session.targetSemanticsVersion === 2 ? 'Target Progress' : 'Legacy Maker Progress',
        data.progress,
      ],
    ],
  };
}

export function hasCompleteSessionTradesV1(
  session: ProductionSession,
  history: activity_history_v1,
): boolean {
  if (
    !history.journalAvailable ||
    history.sessionId !== session.sessionId ||
    !session.pnlComplete ||
    session.endedAt === null ||
    session.fillCount !== history.fills.length ||
    session.totalExecutedVolumeUsd === null
  )
    return false;
  const volume = history.fills.reduce((total, fill) => total + fill.quantity * fill.price, 0);
  return (
    Math.abs(volume - session.totalExecutedVolumeUsd) <= Math.max(0.000001, Math.abs(volume) * 1e-8)
  );
}

function renderActionIcon(kind: 'share' | 'error' | 'trade') {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'share' ? (
        <>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.59 13.51 6.82 3.98M15.41 6.51l-6.82 3.98" />
        </>
      ) : kind === 'error' ? (
        <>
          <path d="m12 3 10 18H2Z" />
          <path d="M12 9v4m0 4h.01" />
        </>
      ) : (
        <>
          <path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1" />
        </>
      )}
    </svg>
  );
}

export async function readSessionHistoryV1(
  sessionId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<activity_history_v1> {
  const response = await fetcher(
    `/api/activity-history?sessionId=${encodeURIComponent(sessionId)}`,
    { signal },
  );
  if (!response.ok)
    throw new Error(
      response.status === 404 || response.status === 503
        ? `HISTORY_API_UNAVAILABLE_HTTP_${response.status}`
        : `HISTORY_HTTP_${response.status}`,
    );
  const result = ActivityHistorySchemaV1.parse(await response.json());
  if (signal.aborted) throw new DOMException('History request aborted', 'AbortError');
  if (result.sessionId !== sessionId) throw new Error('SESSION_MISMATCH');
  return result;
}

export const SessionHistoryModal = (
  props: Readonly<{ kind: 'error' | 'trade'; session: ProductionSession; close: () => void }>,
) => {
  const [history, setHistory] = useState<activity_history_v1 | null>(null);
  const [failure, setFailure] = useState<{
    state: 'ERROR' | 'UNAVAILABLE';
    message: string;
  } | null>(null);
  useEffect(() => {
    const Abort = new AbortController();
    setHistory(null);
    setFailure(null);
    void readSessionHistoryV1(props.session.sessionId, Abort.signal)
      .then((result) => {
        if (!Abort.signal.aborted) setHistory(result);
      })
      .catch((error: unknown) => {
        if (Abort.signal.aborted) return;
        const unavailable =
          error instanceof Error && error.message.startsWith('HISTORY_API_UNAVAILABLE');
        setFailure({
          state: unavailable ? 'UNAVAILABLE' : 'ERROR',
          message: unavailable
            ? 'History API unavailable. The running backend may not include this read-only endpoint.'
            : 'History request or schema validation failed. Retry by reopening this modal.',
        });
      });
    return () => Abort.abort();
  }, [props.session.sessionId]);
  return (
    <SessionModal
      title={props.kind === 'error' ? 'ERROR LOGS' : 'TRADE HISTORY'}
      close={props.close}
    >
      <SessionHistoryContent
        kind={props.kind}
        session={props.session}
        history={history}
        failed={failure !== null}
        failure={failure ?? undefined}
      />
    </SessionModal>
  );
};

export const SessionHistoryContent = (
  props: Readonly<{
    kind: 'error' | 'trade';
    session: ProductionSession;
    history: activity_history_v1 | null;
    failed: boolean;
    failure?: { state: 'ERROR' | 'UNAVAILABLE'; message: string };
  }>,
) => {
  const history = props.history?.sessionId === props.session.sessionId ? props.history : null;
  const failed = props.failed || (props.history !== null && history === null);
  const complete = history !== null && hasCompleteSessionTradesV1(props.session, history);
  const state = failed
    ? (props.failure?.state ?? 'ERROR')
    : history === null
      ? 'LOADING'
      : !history.journalAvailable
        ? 'UNAVAILABLE'
        : props.kind === 'error'
          ? history.errorsComplete
            ? history.errors.length
              ? 'READY'
              : 'EMPTY_VERIFIED'
            : 'PARTIAL_HISTORY'
          : complete
            ? history.fills.length
              ? 'READY'
              : 'EMPTY_VERIFIED'
            : 'PARTIAL_HISTORY';
  return (
    <div className="activity-modal-scroll">
      <p className="activity-session-identity">Session: {props.session.sessionId}</p>
      <p role="status" data-history-state={state}>
        {state}
      </p>
      {failed ? (
        <p role="status">
          Historical data unavailable.{' '}
          {props.failure?.message ?? 'Completeness could not be verified.'}
        </p>
      ) : history === null ? (
        <p role="status">Loading session history…</p>
      ) : !history.journalAvailable ? (
        <p>Historical journal unavailable. No empty-history conclusion can be made.</p>
      ) : (
        <>
          {props.kind === 'error' ? (
            <>
              <p role="status">
                Partial error history: recorded session errors from blockers, failed outcomes and
                execution states. Full runtime error coverage is not verified.
              </p>
              {history.errors.length === 0 ? (
                <p>No verified error records available. Historical logs may be incomplete.</p>
              ) : (
                <div className="activity-error-table">
                  <div className="activity-error-row activity-modal-head">
                    <span>TIME</span>
                    <span>ERROR TYPE</span>
                    <span>DESCRIPTION</span>
                  </div>
                  {history.errors.map((error) => (
                    <div className="activity-error-row" key={error.id}>
                      <time>{new Date(error.timestamp).toLocaleString()}</time>
                      <b>{error.type}</b>
                      <span>{error.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p role="status">
                {complete
                  ? 'Fill count and executed volume match the saved session.'
                  : `Partial trade history: ${history.fills.length} fills found / ${props.session.fillCount ?? 'unverified'} expected; executed value ${formatValue(
                      history.fills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0),
                      2,
                      '$',
                    )} / ${formatValue(props.session.totalExecutedVolumeUsd, 2, '$')} saved.`}{' '}
                Times are journal timestamps. Fees require an exact authenticated fill identity
                match. N/A denotes a verified opening fill; UNKNOWN denotes missing evidence.
                Per-fill realized PnL is not persisted in this journal and is never allocated from
                session PnL.
              </p>
              {history.fills.length === 0 ? (
                <p>
                  {complete
                    ? 'No trades recorded'
                    : 'No verified trades available. Historical data may be incomplete.'}
                </p>
              ) : (
                <table className="activity-trade-table">
                  <thead>
                    <tr>
                      {['TIME', 'DIRECTION', 'PRICE', 'SIZE', 'VALUE', 'FEE', 'PNL AT CLOSE'].map(
                        (label) => (
                          <th key={label}>{label}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {history.fills.map((fill) => (
                      <tr key={fill.fillId}>
                        <td>
                          <time title="Journal observation time; venue execution timestamp unavailable">
                            {new Date(fill.timestamp).toLocaleString()}
                          </time>
                        </td>
                        <td
                          className={
                            fill.side === 'BUY'
                              ? 'activity-positive'
                              : fill.side === 'SELL'
                                ? 'activity-negative'
                                : ''
                          }
                        >
                          {fill.direction ?? fill.side}
                        </td>
                        <td>{formatValue(fill.price, 2, '$')}</td>
                        <td>{formatValue(fill.quantity, 8)} BTC</td>
                        <td>{formatValue(fill.quantity * fill.price, 2, '$')}</td>
                        <td>{formatValue(fill.feeUsd ?? null, 6, '$')}</td>
                        <td
                          className={
                            fill.pnlAtCloseUsd !== null && fill.pnlAtCloseUsd !== undefined
                              ? fill.pnlAtCloseUsd >= 0
                                ? 'activity-positive'
                                : 'activity-negative'
                              : ''
                          }
                        >
                          {fill.closePnlAvailability === 'N/A'
                            ? '?'
                            : fill.closePnlAvailability === 'VERIFIED'
                              ? formatValue(fill.pnlAtCloseUsd ?? null, 6, '$')
                              : 'UNKNOWN'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export const SessionHistoryActions = (
  props: Readonly<{ session: ProductionSession; observedAt: number }>,
) => {
  const [modal, setModal] = useState<'error' | 'trade' | null>(null);
  const { openShare, preview } = useSessionSharePreviewV1();
  const share = buildSessionShareV1(props.session, props.observedAt);
  const exportShare = () => {
    if (share) openShare(share.data, share.rows);
  };
  return (
    <div className="activity-session-actions">
      <div className="activity-action-buttons">
        <span
          title={
            share
              ? 'Share Session: preview and copy selected session PNG'
              : 'Share Session unavailable: verified duration, capital, complete PnL, volume and fill count are required'
          }
          tabIndex={share ? undefined : 0}
        >
          <button
            type="button"
            aria-label="Share Session"
            title={share ? 'Share Session' : 'Verified session totals required'}
            disabled={!share}
            onClick={() => void exportShare()}
          >
            {renderActionIcon('share')}
          </button>
        </span>
        <button
          type="button"
          aria-label="Error Logs"
          title="Error Logs"
          onClick={() => setModal('error')}
        >
          {renderActionIcon('error')}
        </button>
        <button
          type="button"
          aria-label="Trade History"
          title="Trade History"
          onClick={() => setModal('trade')}
        >
          {renderActionIcon('trade')}
        </button>
      </div>
      {preview}
      {modal &&
        createPortal(
          <SessionHistoryModal kind={modal} session={props.session} close={() => setModal(null)} />,
          document.body,
        )}
    </div>
  );
};
