export type decibel_runtime_dependency_v1 = 'economic' | 'recovery' | 'authenticatedState';
export type decibel_runtime_dependency_status_v1 = 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
export type decibel_runtime_phase_v1 =
  | 'BOOTSTRAP'
  | 'RECOVERING'
  | 'WAIT_AUTH'
  | 'WAIT_ECONOMIC'
  | 'READY'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'STOPPING'
  | 'ENDED';
export type decibel_runtime_domain_v1 =
  'AuthState' | 'MarketDataState' | 'EconomicEvidenceState' | 'SessionState' | 'ExecutionState';
export type decibel_runtime_domain_status_v1 = 'INIT' | 'READY' | 'BLOCKED' | 'FAILED' | 'STOPPED';
export type decibel_runtime_inventory_state_v1 =
  'UNKNOWN' | 'FLAT' | 'TRADEABLE_POSITION' | 'UNTRADEABLE_DUST';

export type decibel_runtime_economic_snapshot_v1 = Readonly<{
  observedAt: number;
  makerFeeBps: number;
  makerFeeSource:
    | 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES'
    | 'DECIBEL_AUTHENTICATED_STRATEGY_MAKER_FILL_HISTORY';
  estimatedGasCostUsd: number;
  estimatedGasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95' | 'BOOTSTRAP_CONSERVATIVE_PRIOR';
  aptUsd: number;
  aptUsdSource: string;
  adverseSelectionBufferBps: number | null;
  adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95' | 'GLOBAL_FALLBACK' | 'UNKNOWN';
  safetyMarginBps: number;
  lifecycleCostBudgetBps: number;
  lifecycleCostEntryBps: number;
  candidateAdverseSelection: readonly Readonly<{
    side: 'BUY' | 'SELL';
    distanceBps: number;
    p95AdverseSelectionBps: number;
    sampleCount: number;
    observedAt: number;
  }>[];
}>;

export type decibel_authoritative_runtime_state_v1 = Readonly<{
  revision: number;
  observedAt: number;
  phase: decibel_runtime_phase_v1;
  domains: Readonly<Record<decibel_runtime_domain_v1, decibel_runtime_domain_status_v1>>;
  domainBlockers: Readonly<Record<decibel_runtime_domain_v1, string | null>>;
}>;

export type decibel_runtime_supervisor_snapshot_v1 = Readonly<{
  readiness: Readonly<{
    processReady: boolean;
    accountReady: boolean;
    marketReady: boolean;
    executionSafe: boolean;
    economicReady: boolean;
    blockingComponent: 'PROCESS' | 'ACCOUNT' | 'MARKET' | 'EXECUTION' | 'ECONOMIC' | null;
    blockingReason: string | null;
  }>;
  dependencies: Readonly<
    Record<decibel_runtime_dependency_v1, decibel_runtime_dependency_status_v1>
  >;
  blocker: string | null;
  recoveryCondition: string | null;
  cooldownDeadline: number | null;
  ready: boolean;
  runtimeState: decibel_authoritative_runtime_state_v1;
  inventory: Readonly<{
    state: decibel_runtime_inventory_state_v1;
    exactPositionBase: number | null;
    marketMinimumSize: number | null;
  }>;
  marketData: Readonly<{
    generation: number;
    bboTimestamp: number | null;
    blockerSource: string | null;
  }>;
  executionSnapshot: Readonly<{
    generation: number | null;
    bboTimestamp: number | null;
  }>;
  schedulerOwner: 'RuntimeSupervisor';
  scheduledJobs: readonly string[];
}>;

const dependencyBlockers: Readonly<Record<decibel_runtime_dependency_v1, string>> = Object.freeze({
  economic: 'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED',
  recovery: 'PRODUCTION_RECOVERY_INITIALIZATION_REQUIRED',
  authenticatedState: 'PRODUCTION_AUTHENTICATED_STATE_INITIALIZATION_REQUIRED',
});

export class decibel_runtime_supervisor_v1 {
  private Phase: decibel_runtime_phase_v1 = 'BOOTSTRAP';
  private Revision = 0;
  private readonly Domains: Record<decibel_runtime_domain_v1, decibel_runtime_domain_status_v1> = {
    AuthState: 'INIT',
    MarketDataState: 'INIT',
    EconomicEvidenceState: 'INIT',
    SessionState: 'INIT',
    ExecutionState: 'INIT',
  };
  private readonly DomainBlockers: Record<decibel_runtime_domain_v1, string | null> = {
    AuthState: null,
    MarketDataState: null,
    EconomicEvidenceState: null,
    SessionState: null,
    ExecutionState: null,
  };
  private readonly ScheduledJobs = new Map<
    string,
    Readonly<{
      dueAt: number;
      intervalMs: number | null;
      operation: () => void | Promise<void>;
    }>
  >();
  private readonly InFlightJobs = new Set<string>();
  private SchedulerTimer: ReturnType<typeof setTimeout> | null = null;
  private SchedulerStopped = false;
  private readonly Dependencies: Record<
    decibel_runtime_dependency_v1,
    decibel_runtime_dependency_status_v1
  > = {
    economic: 'INIT',
    recovery: 'INIT',
    authenticatedState: 'INIT',
  };
  private transientBlocker: Readonly<{
    code: string;
    recoveryCondition: string;
    deadline: number;
  }> | null = null;
  private reconciliationBlocker: string | null = null;
  private Recovery: Promise<unknown> | null = null;
  private AuthenticatedRefresh: Promise<unknown> | null = null;
  private AuthenticatedRefreshController: AbortController | null = null;
  private AuthenticatedFreshness: Readonly<{ observedAt: number; maximumAgeMs: number }> | null =
    null;
  private AuthenticatedSnapshot: unknown = null;
  private MarketDataSnapshot: unknown = null;
  private MarketDataFreshness: Readonly<{ observedAt: number; maximumAgeMs: number }> | null = null;
  private MarketDataGeneration = 0;
  private MarketDataBlockerSource: string | null = null;
  private EconomicSnapshot: decibel_runtime_economic_snapshot_v1 | null = null;
  private EconomicSnapshotBlocker = 'PRODUCTION_ECONOMIC_SNAPSHOT_REQUIRED';
  private ExecutionSnapshot: unknown = null;
  private ExecutionSnapshotBlocker = 'PRODUCTION_EXECUTION_SNAPSHOT_REQUIRED';
  private ExecutionSnapshotObservedAt: number | null = null;
  private ExecutionSnapshotGeneration: number | null = null;
  private ExecutionBboTimestamp: number | null = null;
  private InventoryState: decibel_runtime_inventory_state_v1 = 'UNKNOWN';
  private ExactPositionBase: number | null = null;
  private MarketMinimumSize: number | null = null;

  runRecovery<T>(operation: () => Promise<T>): Promise<T> {
    if (this.Recovery !== null) return this.Recovery as Promise<T>;
    const Recovery = operation();
    this.Recovery = Recovery;
    void Recovery.finally(() => {
      if (this.Recovery === Recovery) this.Recovery = null;
    }).catch(() => undefined);
    return Recovery;
  }

  isRecoveryInFlight(): boolean {
    return this.Recovery !== null;
  }

  runAuthenticatedRefresh<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs = 10_000,
  ): Promise<T> {
    if (this.AuthenticatedRefresh !== null) return this.AuthenticatedRefresh as Promise<T>;
    if (this.SchedulerStopped)
      return Promise.reject(new Error('PRODUCTION_AUTHENTICATED_READ_SHUTDOWN'));
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
      return Promise.reject(new Error('AUTHENTICATED_REFRESH_TIMEOUT_INVALID'));
    const Controller = new AbortController();
    this.AuthenticatedRefreshController = Controller;
    let rejectAborted!: (error: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = reject;
    });
    const onAbort = () => rejectAborted(Controller.signal.reason);
    Controller.signal.addEventListener('abort', onAbort, { once: true });
    const Timeout = setTimeout(
      () => Controller.abort(new Error('PRODUCTION_AUTHENTICATED_READ_TIMEOUT')),
      timeoutMs,
    );
    const pending = Promise.resolve().then(() => {
      Controller.signal.throwIfAborted();
      return operation(Controller.signal);
    });
    const AuthenticatedRefresh = Promise.race([pending, aborted]).finally(() => {
      clearTimeout(Timeout);
      if (!Controller.signal.aborted)
        Controller.abort(new Error('PRODUCTION_AUTHENTICATED_REFRESH_SETTLED'));
      Controller.signal.removeEventListener('abort', onAbort);
      if (this.AuthenticatedRefresh === AuthenticatedRefresh) {
        this.AuthenticatedRefresh = null;
        this.AuthenticatedRefreshController = null;
      }
    });
    this.AuthenticatedRefresh = AuthenticatedRefresh;
    return AuthenticatedRefresh;
  }

  isAuthenticatedRefreshInFlight(): boolean {
    return this.AuthenticatedRefresh !== null;
  }

  setDependency(
    dependency: decibel_runtime_dependency_v1,
    status: decibel_runtime_dependency_status_v1,
  ): void {
    if (dependency === 'economic' && status === 'READY' && this.EconomicSnapshot === null) {
      this.Dependencies.economic = 'BLOCKED';
      this.setDomainState('EconomicEvidenceState', 'BLOCKED', this.EconomicSnapshotBlocker);
      return;
    }
    this.Dependencies[dependency] = status;
    const domain =
      dependency === 'economic'
        ? 'EconomicEvidenceState'
        : dependency === 'authenticatedState'
          ? 'AuthState'
          : 'SessionState';
    this.setDomainState(
      domain,
      status === 'INIT' ? 'INIT' : status,
      status === 'READY' ? null : dependencyBlockers[dependency],
    );
  }

  setDomainState(
    domain: decibel_runtime_domain_v1,
    status: decibel_runtime_domain_status_v1,
    blocker: string | null = null,
  ): void {
    if (domain === 'ExecutionState') {
      this.deriveExecutionState();
      this.recomputePhase();
      return;
    }
    if (domain === 'MarketDataState' && status === 'READY' && this.MarketDataSnapshot === null) {
      this.publishDomainState(
        'MarketDataState',
        'BLOCKED',
        'PRODUCTION_MARKET_DATA_SNAPSHOT_REQUIRED',
      );
      this.deriveExecutionState();
      this.recomputePhase();
      return;
    }
    if (
      domain === 'EconomicEvidenceState' &&
      status === 'READY' &&
      this.EconomicSnapshot === null
    ) {
      this.publishDomainState('EconomicEvidenceState', 'BLOCKED', this.EconomicSnapshotBlocker);
      this.deriveExecutionState();
      this.recomputePhase();
      return;
    }
    this.publishDomainState(domain, status, status === 'READY' ? null : blocker);
    this.deriveExecutionState();
    this.recomputePhase();
  }

  private publishDomainState(
    domain: decibel_runtime_domain_v1,
    status: decibel_runtime_domain_status_v1,
    blocker: string | null,
  ): void {
    if (this.Domains[domain] === status && this.DomainBlockers[domain] === blocker) return;
    this.Domains[domain] = status;
    this.DomainBlockers[domain] = blocker;
    this.Revision += 1;
  }

  private deriveExecutionState(): void {
    const prerequisites: readonly decibel_runtime_domain_v1[] = [
      'AuthState',
      'MarketDataState',
      'EconomicEvidenceState',
      'SessionState',
    ];
    const unavailable = prerequisites.find((domain) => this.Domains[domain] !== 'READY');
    if (this.reconciliationBlocker !== null) {
      this.publishDomainState('ExecutionState', 'BLOCKED', this.reconciliationBlocker);
      return;
    }
    if (this.InventoryState === 'UNTRADEABLE_DUST') {
      this.publishDomainState('ExecutionState', 'BLOCKED', 'UNTRADEABLE_DUST');
      return;
    }
    if (unavailable === undefined && this.ExecutionSnapshot !== null) {
      this.publishDomainState('ExecutionState', 'READY', null);
      return;
    }
    if (unavailable === undefined) {
      this.publishDomainState('ExecutionState', 'BLOCKED', this.ExecutionSnapshotBlocker);
      return;
    }
    const allInitializing = prerequisites.every((domain) => this.Domains[domain] === 'INIT');
    this.publishDomainState(
      'ExecutionState',
      allInitializing ? 'INIT' : 'BLOCKED',
      this.DomainBlockers[unavailable] ?? `RUNTIME_${unavailable.toUpperCase()}_NOT_READY`,
    );
  }

  setPhase(phase: decibel_runtime_phase_v1): void {
    if (this.Phase === phase) return;
    this.Phase = phase;
    this.Revision += 1;
  }

  private recomputePhase(): void {
    if (this.Phase === 'STOPPING' || this.Phase === 'ENDED') return;
    if (this.Dependencies.authenticatedState !== 'READY') return this.setPhase('WAIT_AUTH');
    if (this.Dependencies.recovery !== 'READY') return this.setPhase('RECOVERING');
    if (this.Dependencies.economic !== 'READY') return this.setPhase('WAIT_ECONOMIC');
    if (this.Domains.MarketDataState !== 'READY') return this.setPhase('DEGRADED');
    if (this.Domains.ExecutionState !== 'READY') return this.setPhase('DEGRADED');
    this.setPhase('READY');
  }

  scheduleOnce(key: string, delayMs: number, operation: () => void | Promise<void>): void {
    this.schedule(key, delayMs, null, operation);
  }

  scheduleRecurring(
    key: string,
    intervalMs: number,
    operation: () => void | Promise<void>,
    initialDelayMs = intervalMs,
  ): void {
    this.schedule(key, initialDelayMs, intervalMs, operation);
  }

  private schedule(
    key: string,
    delayMs: number,
    intervalMs: number | null,
    operation: () => void | Promise<void>,
  ): void {
    if (this.SchedulerStopped) return;
    if (!Number.isFinite(delayMs) || delayMs < 0)
      throw new Error('RUNTIME_SUPERVISOR_SCHEDULE_DELAY_INVALID');
    if (intervalMs !== null && (!Number.isFinite(intervalMs) || intervalMs <= 0))
      throw new Error('RUNTIME_SUPERVISOR_SCHEDULE_INTERVAL_INVALID');
    this.ScheduledJobs.set(
      key,
      Object.freeze({ dueAt: Date.now() + delayMs, intervalMs, operation }),
    );
    this.armScheduler();
  }

  cancelScheduled(key: string): void {
    this.ScheduledJobs.delete(key);
    this.armScheduler();
  }

  hasScheduled(key: string): boolean {
    return this.ScheduledJobs.has(key);
  }

  stopScheduler(): void {
    this.SchedulerStopped = true;
    this.AuthenticatedRefreshController?.abort(new Error('PRODUCTION_AUTHENTICATED_READ_SHUTDOWN'));
    this.ScheduledJobs.clear();
    this.InFlightJobs.clear();
    if (this.SchedulerTimer !== null) clearTimeout(this.SchedulerTimer);
    this.SchedulerTimer = null;
  }

  private armScheduler(): void {
    if (this.SchedulerStopped) return;
    if (this.SchedulerTimer !== null) clearTimeout(this.SchedulerTimer);
    this.SchedulerTimer = null;
    const next = [...this.ScheduledJobs.entries()]
      .filter(([key]) => !this.InFlightJobs.has(key))
      .map(([, job]) => job)
      .reduce<number | null>(
        (minimum, job) => (minimum === null || job.dueAt < minimum ? job.dueAt : minimum),
        null,
      );
    if (next === null) return;
    this.SchedulerTimer = setTimeout(
      () => this.runScheduledJobs(),
      Math.min(2_147_483_647, Math.max(0, next - Date.now())),
    );
  }

  private runScheduledJobs(): void {
    this.SchedulerTimer = null;
    if (this.SchedulerStopped) return;
    const now = Date.now();
    for (const [key, job] of [...this.ScheduledJobs]) {
      if (job.dueAt > now) continue;
      // Keep a one-shot replacement queued until the previous owner settles.
      if (this.InFlightJobs.has(key)) continue;
      if (job.intervalMs === null) this.ScheduledJobs.delete(key);
      else this.ScheduledJobs.set(key, Object.freeze({ ...job, dueAt: now + job.intervalMs }));
      this.InFlightJobs.add(key);
      try {
        void Promise.resolve(job.operation())
          .catch(() => undefined)
          .finally(() => {
            this.InFlightJobs.delete(key);
            this.armScheduler();
          });
      } catch {
        // Domain jobs publish their own fail-closed state; scheduler liveness is independent.
        this.InFlightJobs.delete(key);
      }
    }
    this.armScheduler();
  }

  setAuthenticatedSnapshot(observedAt: number, maximumAgeMs: number, snapshot?: unknown): void {
    if (
      !Number.isSafeInteger(observedAt) ||
      !Number.isSafeInteger(maximumAgeMs) ||
      maximumAgeMs <= 0
    )
      throw new Error('RUNTIME_SUPERVISOR_AUTHENTICATED_FRESHNESS_INVALID');
    if (this.AuthenticatedFreshness !== null && observedAt < this.AuthenticatedFreshness.observedAt)
      return;
    this.AuthenticatedFreshness = Object.freeze({ observedAt, maximumAgeMs });
    if (snapshot !== undefined) this.AuthenticatedSnapshot = snapshot;
    this.Dependencies.authenticatedState = 'READY';
    if (this.transientBlocker?.code.startsWith('PRODUCTION_AUTHENTICATED_'))
      this.transientBlocker = null;
    this.setDomainState('AuthState', 'READY');
  }

  setAuthenticatedInventory(positionBase: number, marketMinimumSize: number | null): void {
    if (!Number.isFinite(positionBase))
      throw new Error('RUNTIME_SUPERVISOR_AUTHENTICATED_POSITION_INVALID');
    if (
      marketMinimumSize !== null &&
      (!Number.isFinite(marketMinimumSize) || marketMinimumSize <= 0)
    )
      throw new Error('RUNTIME_SUPERVISOR_MARKET_MINIMUM_SIZE_INVALID');
    this.ExactPositionBase = positionBase;
    if (marketMinimumSize !== null) this.MarketMinimumSize = marketMinimumSize;
    this.InventoryState =
      positionBase === 0
        ? 'FLAT'
        : this.MarketMinimumSize !== null && Math.abs(positionBase) < this.MarketMinimumSize
          ? 'UNTRADEABLE_DUST'
          : 'TRADEABLE_POSITION';
    this.deriveExecutionState();
    this.recomputePhase();
  }

  getAuthenticatedSnapshot<T>(): T | null {
    return (this.AuthenticatedSnapshot as T | null) ?? null;
  }

  setMarketDataSnapshot(snapshot: unknown, observedAt?: number, maximumAgeMs?: number): number {
    const candidateObservedAt =
      observedAt ??
      (typeof snapshot === 'object' && snapshot !== null && 'observedAt' in snapshot
        ? (snapshot as { observedAt?: unknown }).observedAt
        : undefined);
    if (
      !Number.isSafeInteger(candidateObservedAt) ||
      (maximumAgeMs !== undefined && (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0))
    )
      throw new Error('RUNTIME_SUPERVISOR_MARKET_DATA_FRESHNESS_INVALID');
    // A late response belongs to an older observation even when its transport
    // diagnostics report a failure. It cannot invalidate newer venue evidence.
    if (
      this.MarketDataFreshness !== null &&
      (candidateObservedAt as number) < this.MarketDataFreshness.observedAt
    )
      return this.MarketDataGeneration;
    if (typeof snapshot === 'object' && snapshot !== null && 'wsConnectionState' in snapshot) {
      const diagnostics = snapshot as {
        wsConnectionState?: unknown;
        wsSubscriptionState?: unknown;
        lastValidBboAgeMs?: unknown;
      };
      if (
        diagnostics.wsConnectionState !== 'CONNECTED' ||
        diagnostics.wsSubscriptionState !== 'SUBSCRIBED' ||
        typeof diagnostics.lastValidBboAgeMs !== 'number' ||
        !Number.isFinite(diagnostics.lastValidBboAgeMs) ||
        diagnostics.lastValidBboAgeMs > (maximumAgeMs ?? 5_000)
      ) {
        this.setMarketDataBlocked('PRODUCTION_LIVE_SOURCE_BOOK_STALE', snapshot);
        return this.MarketDataGeneration;
      }
    }
    this.MarketDataSnapshot = snapshot;
    this.MarketDataFreshness =
      maximumAgeMs === undefined
        ? null
        : Object.freeze({ observedAt: candidateObservedAt as number, maximumAgeMs });
    this.MarketDataGeneration += 1;
    this.MarketDataBlockerSource = null;
    if (this.ExecutionSnapshotGeneration !== this.MarketDataGeneration) {
      this.ExecutionSnapshot = null;
      this.ExecutionSnapshotObservedAt = null;
      this.ExecutionSnapshotGeneration = null;
      this.ExecutionBboTimestamp = null;
      this.ExecutionSnapshotBlocker = 'PRODUCTION_EXECUTION_SNAPSHOT_MARKET_GENERATION_REQUIRED';
    }
    this.setDomainState('MarketDataState', 'READY');
    return this.MarketDataGeneration;
  }

  getMarketDataSnapshot<T>(): T | null {
    return (this.MarketDataSnapshot as T | null) ?? null;
  }

  getMarketDataProjection(): Readonly<{
    generation: number;
    bboTimestamp: number | null;
    blockerSource: string | null;
  }> {
    return Object.freeze({
      generation: this.MarketDataGeneration,
      bboTimestamp: this.MarketDataFreshness?.observedAt ?? null,
      blockerSource: this.MarketDataBlockerSource,
    });
  }

  setEconomicSnapshot(snapshot: decibel_runtime_economic_snapshot_v1): void {
    const numericFields = [
      ['OBSERVED_AT', snapshot.observedAt],
      ['MAKER_FEE_BPS', snapshot.makerFeeBps],
      ['GAS_COST_USD', snapshot.estimatedGasCostUsd],
      ['APT_USD', snapshot.aptUsd],
      ['SAFETY_MARGIN_BPS', snapshot.safetyMarginBps],
      ['LIFECYCLE_COST_BUDGET_BPS', snapshot.lifecycleCostBudgetBps],
      ['LIFECYCLE_COST_ENTRY_BPS', snapshot.lifecycleCostEntryBps],
    ] as const;
    const missingNumber = numericFields.find(
      ([field, value]) =>
        !Number.isFinite(value) ||
        value < 0 ||
        (field === 'APT_USD' && value <= 0) ||
        (field === 'OBSERVED_AT' && !Number.isSafeInteger(value)),
    );
    const stringFields = [
      ['MAKER_FEE_SOURCE', snapshot.makerFeeSource],
      ['GAS_COST_SOURCE', snapshot.estimatedGasCostSource],
      ['APT_USD_SOURCE', snapshot.aptUsdSource],
    ] as const;
    const missingString = stringFields.find(([, value]) => value.length === 0);
    if (missingNumber !== undefined || missingString !== undefined) {
      const field = missingNumber?.[0] ?? missingString![0];
      this.clearEconomicSnapshot(`PRODUCTION_ECONOMIC_SNAPSHOT_MISSING_${field}`);
      return;
    }
    this.EconomicSnapshot = Object.freeze({
      ...snapshot,
      candidateAdverseSelection: Object.freeze(
        snapshot.candidateAdverseSelection.map((candidate) => Object.freeze({ ...candidate })),
      ),
    });
    if (
      typeof this.ExecutionSnapshot === 'object' &&
      this.ExecutionSnapshot !== null &&
      'input' in this.ExecutionSnapshot
    )
      this.ExecutionSnapshot = Object.freeze({
        ...this.ExecutionSnapshot,
        economicInputs: this.EconomicSnapshot,
      });
    this.EconomicSnapshotBlocker = 'PRODUCTION_ECONOMIC_SNAPSHOT_REQUIRED';
    this.Dependencies.economic = 'READY';
    this.setDomainState('EconomicEvidenceState', 'READY');
  }

  getEconomicSnapshot(): decibel_runtime_economic_snapshot_v1 | null {
    return this.EconomicSnapshot;
  }

  clearEconomicSnapshot(reason: string): void {
    this.EconomicSnapshot = null;
    this.EconomicSnapshotBlocker = reason;
    this.Dependencies.economic = 'BLOCKED';
    this.ExecutionSnapshot = null;
    this.ExecutionSnapshotObservedAt = null;
    this.ExecutionSnapshotGeneration = null;
    this.ExecutionBboTimestamp = null;
    this.ExecutionSnapshotBlocker = reason;
    this.setDomainState('EconomicEvidenceState', 'BLOCKED', reason);
  }

  setExecutionSnapshot(snapshot: unknown, marketDataGeneration = this.MarketDataGeneration): void {
    if (snapshot === null || snapshot === undefined)
      throw new Error('RUNTIME_SUPERVISOR_EXECUTION_SNAPSHOT_INVALID');
    if (marketDataGeneration !== this.MarketDataGeneration) return;
    if (typeof snapshot === 'object' && 'input' in snapshot) {
      const candidate = snapshot as {
        economicInputs?: unknown;
        input?: {
          now?: unknown;
          actualInventoryBase?: unknown;
          openOrders?: unknown;
          metadata?: { minimumSize?: unknown };
          book?: { bestBid?: unknown; bestAsk?: unknown; observedAt?: unknown };
        };
      };
      const input = candidate.input;
      const missing =
        input === undefined
          ? 'INPUT'
          : !Number.isSafeInteger(input.now)
            ? 'OBSERVED_AT'
            : typeof input.actualInventoryBase !== 'number' ||
                !Number.isFinite(input.actualInventoryBase)
              ? 'AUTHENTICATED_INVENTORY'
              : !Array.isArray(input.openOrders)
                ? 'OPEN_ORDERS'
                : input.book === undefined ||
                    typeof input.book.bestBid !== 'number' ||
                    !Number.isFinite(input.book.bestBid) ||
                    typeof input.book.bestAsk !== 'number' ||
                    !Number.isFinite(input.book.bestAsk) ||
                    !Number.isSafeInteger(input.book.observedAt)
                  ? 'MARKET_DATA'
                  : candidate.economicInputs === null || candidate.economicInputs === undefined
                    ? 'ECONOMIC_INPUTS'
                    : null;
      if (missing !== null) {
        this.clearExecutionSnapshot(`PRODUCTION_EXECUTION_SNAPSHOT_MISSING_${missing}`);
        return;
      }
      const validInput = input as NonNullable<typeof input>;
      const position = validInput.actualInventoryBase as number;
      const minimumSize = validInput.metadata?.minimumSize;
      this.ExactPositionBase = position;
      this.MarketMinimumSize =
        typeof minimumSize === 'number' && Number.isFinite(minimumSize) && minimumSize > 0
          ? minimumSize
          : null;
      this.InventoryState =
        position === 0
          ? 'FLAT'
          : this.MarketMinimumSize !== null && Math.abs(position) < this.MarketMinimumSize
            ? 'UNTRADEABLE_DUST'
            : 'TRADEABLE_POSITION';
    }
    this.ExecutionSnapshot = snapshot;
    this.ExecutionSnapshotObservedAt =
      typeof snapshot === 'object' && snapshot !== null && 'input' in snapshot
        ? ((snapshot as { input?: { now?: number } }).input?.now ?? null)
        : null;
    this.ExecutionSnapshotGeneration = marketDataGeneration;
    this.ExecutionBboTimestamp =
      typeof snapshot === 'object' && snapshot !== null && 'input' in snapshot
        ? ((snapshot as { input?: { book?: { observedAt?: number } } }).input?.book?.observedAt ??
          null)
        : null;
    this.ExecutionSnapshotBlocker = 'PRODUCTION_EXECUTION_SNAPSHOT_REQUIRED';
    this.deriveExecutionState();
    this.recomputePhase();
  }

  getExecutionSnapshot<T>(): T | null {
    return (this.ExecutionSnapshot as T | null) ?? null;
  }

  clearExecutionSnapshot(reason: string): void {
    this.ExecutionSnapshot = null;
    this.ExecutionSnapshotObservedAt = null;
    this.ExecutionSnapshotGeneration = null;
    this.ExecutionBboTimestamp = null;
    this.ExecutionSnapshotBlocker = reason;
    this.deriveExecutionState();
    this.recomputePhase();
  }

  setMarketDataBlocked(reason: string, diagnostics?: unknown, expectedGeneration?: number): void {
    if (expectedGeneration !== undefined && expectedGeneration !== this.MarketDataGeneration)
      return;
    if (diagnostics !== undefined) this.MarketDataSnapshot = diagnostics;
    this.MarketDataBlockerSource = reason;
    this.ExecutionSnapshot = null;
    this.ExecutionSnapshotObservedAt = null;
    this.ExecutionSnapshotGeneration = null;
    this.ExecutionBboTimestamp = null;
    this.ExecutionSnapshotBlocker = reason;
    this.setDomainState('MarketDataState', 'BLOCKED', reason);
  }

  private refreshMarketDataFreshness(now: number): void {
    if (this.MarketDataFreshness === null) return;
    const { observedAt, maximumAgeMs } = this.MarketDataFreshness;
    if (observedAt <= now && now - observedAt <= maximumAgeMs) return;
    const hasRestingOrders =
      typeof this.ExecutionSnapshot === 'object' &&
      this.ExecutionSnapshot !== null &&
      'input' in this.ExecutionSnapshot &&
      Array.isArray(
        (this.ExecutionSnapshot as { input?: { openOrders?: unknown } }).input?.openOrders,
      ) &&
      (this.ExecutionSnapshot as { input: { openOrders: unknown[] } }).input.openOrders.length > 0;
    this.publishDomainState(
      'MarketDataState',
      'BLOCKED',
      hasRestingOrders
        ? 'PRODUCTION_LIVE_SOURCE_BOOK_STALE_RESTING_ORDER_RECONCILIATION_REQUIRED'
        : 'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
    );
    this.MarketDataBlockerSource =
      this.DomainBlockers.MarketDataState ?? 'PRODUCTION_LIVE_SOURCE_BOOK_STALE';
    this.ExecutionSnapshot = null;
    this.ExecutionSnapshotObservedAt = null;
    this.ExecutionSnapshotGeneration = null;
    this.ExecutionBboTimestamp = null;
    this.ExecutionSnapshotBlocker =
      this.DomainBlockers.MarketDataState ?? 'PRODUCTION_LIVE_SOURCE_BOOK_STALE';
    this.deriveExecutionState();
    this.recomputePhase();
  }

  private refreshExecutionSnapshotFreshness(now: number): void {
    if (this.ExecutionSnapshotObservedAt === null || this.AuthenticatedFreshness === null) return;
    if (
      this.ExecutionSnapshotObservedAt <= now &&
      now - this.ExecutionSnapshotObservedAt <= this.AuthenticatedFreshness.maximumAgeMs
    )
      return;
    this.ExecutionSnapshotBlocker = 'PRODUCTION_EXECUTION_SNAPSHOT_STALE';
    this.ExecutionSnapshot = null;
    this.ExecutionSnapshotObservedAt = null;
    this.deriveExecutionState();
    this.recomputePhase();
  }

  getAuthenticatedEvidenceDiagnostics(now = Date.now()) {
    const freshness = this.AuthenticatedFreshness;
    const ready = this.isAuthenticatedStateReady(now);
    return Object.freeze({
      observedAt: freshness?.observedAt ?? null,
      maximumAgeMs: freshness?.maximumAgeMs ?? null,
      ageMs: freshness === null ? null : now - freshness.observedAt,
      snapshotPublished: this.AuthenticatedSnapshot !== null,
      ready,
      blocker: ready
        ? null
        : (this.DomainBlockers.AuthState ?? dependencyBlockers.authenticatedState),
      refreshInFlight: this.isAuthenticatedRefreshInFlight(),
    });
  }

  getAuthenticatedRefreshDeadline(safetyMarginMs: number): number | null {
    if (!Number.isSafeInteger(safetyMarginMs) || safetyMarginMs < 0)
      throw new Error('RUNTIME_SUPERVISOR_AUTHENTICATED_REFRESH_MARGIN_INVALID');
    if (this.AuthenticatedFreshness === null) return null;
    const { observedAt, maximumAgeMs } = this.AuthenticatedFreshness;
    const boundedMargin = Math.min(safetyMarginMs, Math.max(0, maximumAgeMs - 1));
    return observedAt + maximumAgeMs - boundedMargin;
  }

  setAuthenticatedReadBlocked(now = Date.now()): void {
    // A failed refresh is not evidence that the last atomically published
    // authenticated snapshot became invalid. Keep that snapshot authoritative
    // for its existing freshness window while the supervisor-owned retry path
    // recovers. Once it expires (or when no snapshot has ever published), the
    // normal freshness transition remains fail-closed.
    this.refreshAuthenticatedFreshness(now);
    if (this.Dependencies.authenticatedState === 'READY') return;
    this.Dependencies.authenticatedState = 'BLOCKED';
    this.setDomainState(
      'AuthState',
      'BLOCKED',
      this.AuthenticatedFreshness === null
        ? 'PRODUCTION_AUTHENTICATED_STATE_INITIALIZATION_REQUIRED'
        : 'PRODUCTION_AUTHENTICATED_STATE_STALE',
    );
  }

  isAuthenticatedStateReady(now = Date.now()): boolean {
    this.refreshAuthenticatedFreshness(now);
    return this.Dependencies.authenticatedState === 'READY';
  }

  private refreshAuthenticatedFreshness(now: number): void {
    if (this.AuthenticatedFreshness === null) return;
    const { observedAt, maximumAgeMs } = this.AuthenticatedFreshness;
    this.Dependencies.authenticatedState =
      observedAt <= now && now - observedAt <= maximumAgeMs ? 'READY' : 'BLOCKED';
    this.setDomainState(
      'AuthState',
      this.Dependencies.authenticatedState === 'READY' ? 'READY' : 'BLOCKED',
      this.Dependencies.authenticatedState === 'READY'
        ? null
        : 'PRODUCTION_AUTHENTICATED_STATE_STALE',
    );
  }

  setFiniteCooldown(code: string, deadline: number, recoveryCondition: string): void {
    if (!Number.isSafeInteger(deadline) || deadline <= 0)
      throw new Error('RUNTIME_SUPERVISOR_COOLDOWN_DEADLINE_INVALID');
    this.transientBlocker = Object.freeze({ code, deadline, recoveryCondition });
  }

  setReconciliationRequired(required: boolean, code = 'RECONCILIATION_REQUIRED'): void {
    this.reconciliationBlocker = required ? code : null;
    this.deriveExecutionState();
    this.recomputePhase();
  }

  clearTransientBlocker(): void {
    this.transientBlocker = null;
  }

  getSnapshot(now = Date.now()): decibel_runtime_supervisor_snapshot_v1 {
    this.refreshAuthenticatedFreshness(now);
    this.refreshMarketDataFreshness(now);
    this.refreshExecutionSnapshotFreshness(now);
    if (this.transientBlocker !== null && now >= this.transientBlocker.deadline)
      this.transientBlocker = null;
    const dependency = (Object.keys(this.Dependencies) as decibel_runtime_dependency_v1[]).find(
      (name) => this.Dependencies[name] !== 'READY',
    );
    const blocker =
      this.reconciliationBlocker ??
      (dependency === undefined
        ? null
        : dependency === 'authenticatedState'
          ? (this.DomainBlockers.AuthState ?? dependencyBlockers[dependency])
          : dependencyBlockers[dependency]) ??
      (this.Domains.ExecutionState === 'READY' ? null : this.DomainBlockers.ExecutionState) ??
      this.transientBlocker?.code ??
      null;
    const accountReady = this.Domains.AuthState === 'READY';
    const marketReady = this.Domains.MarketDataState === 'READY';
    const economicReady = this.Domains.EconomicEvidenceState === 'READY';
    const executionSafe = this.Domains.ExecutionState === 'READY';
    const processReady =
      !this.SchedulerStopped && this.Phase !== 'STOPPING' && this.Phase !== 'ENDED';
    const blockingComponent = !processReady
      ? 'PROCESS'
      : !accountReady
        ? 'ACCOUNT'
        : !marketReady
          ? 'MARKET'
          : !economicReady
            ? 'ECONOMIC'
            : !executionSafe
              ? 'EXECUTION'
              : null;
    const blockingDomain =
      blockingComponent === 'ACCOUNT'
        ? 'AuthState'
        : blockingComponent === 'MARKET'
          ? 'MarketDataState'
          : blockingComponent === 'ECONOMIC'
            ? 'EconomicEvidenceState'
            : blockingComponent === 'EXECUTION'
              ? 'ExecutionState'
              : null;
    return Object.freeze({
      readiness: Object.freeze({
        processReady,
        accountReady,
        marketReady,
        executionSafe,
        economicReady,
        blockingComponent,
        blockingReason:
          blockingComponent === 'PROCESS'
            ? 'RUNTIME_SUPERVISOR_STOPPED'
            : blockingDomain === null
              ? null
              : (this.DomainBlockers[blockingDomain] ?? blocker),
      }),
      dependencies: Object.freeze({ ...this.Dependencies }),
      blocker,
      recoveryCondition:
        this.reconciliationBlocker !== null
          ? 'AUTHORITATIVE_RECONCILIATION'
          : dependency !== undefined
            ? `DEPENDENCY_READY:${dependency}`
            : this.Domains.ExecutionState !== 'READY'
              ? `EXECUTION_SNAPSHOT_READY:${this.DomainBlockers.ExecutionState ?? 'UNKNOWN'}`
              : (this.transientBlocker?.recoveryCondition ?? null),
      cooldownDeadline: this.transientBlocker?.deadline ?? null,
      ready: blocker === null,
      runtimeState: Object.freeze({
        revision: this.Revision,
        observedAt: now,
        phase: this.Phase,
        domains: Object.freeze({ ...this.Domains }),
        domainBlockers: Object.freeze({ ...this.DomainBlockers }),
      }),
      inventory: Object.freeze({
        state: this.InventoryState,
        exactPositionBase: this.ExactPositionBase,
        marketMinimumSize: this.MarketMinimumSize,
      }),
      marketData: Object.freeze({
        generation: this.MarketDataGeneration,
        bboTimestamp: this.MarketDataFreshness?.observedAt ?? null,
        blockerSource: this.MarketDataBlockerSource,
      }),
      executionSnapshot: Object.freeze({
        generation: this.ExecutionSnapshotGeneration,
        bboTimestamp: this.ExecutionBboTimestamp,
      }),
      schedulerOwner: 'RuntimeSupervisor',
      scheduledJobs: Object.freeze([...this.ScheduledJobs.keys()].sort()),
    });
  }

  assertReady(now = Date.now()): void {
    const snapshot = this.getSnapshot(now);
    if (snapshot.blocker !== null) throw new Error(snapshot.blocker);
  }

  assertSessionStartReady(now = Date.now()): void {
    this.refreshAuthenticatedFreshness(now);
    if (this.transientBlocker !== null && now >= this.transientBlocker.deadline)
      this.transientBlocker = null;
    if (this.reconciliationBlocker !== null) throw new Error(this.reconciliationBlocker);
    for (const dependency of ['recovery', 'authenticatedState'] as const)
      if (this.Dependencies[dependency] !== 'READY')
        throw new Error(
          dependency === 'authenticatedState'
            ? (this.DomainBlockers.AuthState ?? dependencyBlockers[dependency])
            : dependencyBlockers[dependency],
        );
    if (this.transientBlocker !== null) throw new Error(this.transientBlocker.code);
  }
}

export async function ensureDecibelAuthenticatedStateReadyForStartV1(
  Supervisor: decibel_runtime_supervisor_v1,
  refreshAuthenticatedState: () => Promise<void>,
  now: () => number = Date.now,
): Promise<void> {
  if (!Supervisor.isAuthenticatedStateReady(now())) await refreshAuthenticatedState();
  Supervisor.assertSessionStartReady(now());
}

export async function readDecibelSupervisorAuthenticatedSnapshotV1<T>(
  Supervisor: decibel_runtime_supervisor_v1,
  refreshAuthenticatedState: () => Promise<unknown>,
  now: () => number = Date.now,
): Promise<T> {
  if (!Supervisor.isAuthenticatedStateReady(now())) {
    try {
      await refreshAuthenticatedState();
    } catch (error) {
      throw new Error('PRODUCTION_AUTHENTICATED_READ_TRANSIENT', { cause: error });
    }
  }
  if (!Supervisor.isAuthenticatedStateReady(now()))
    throw new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED');
  const snapshot = Supervisor.getAuthenticatedSnapshot<T>();
  if (snapshot === null) throw new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED');
  return snapshot;
}
