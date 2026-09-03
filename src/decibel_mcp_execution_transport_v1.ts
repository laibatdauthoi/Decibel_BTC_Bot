import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import { validateDecibelPinnedMcpRuntimeV1 } from './decibel_pinned_mcp_runtime_v1.js';
export interface DecibelMcpTransportV1 {
  start(): Promise<void>;
  listTools(): Promise<unknown>;
  getServerIdentity(): unknown;
  getDiagnostics(): decibel_mcp_transport_diagnostics_v1;
  callTool(name: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
  close(): Promise<void>;
}

export type decibel_mcp_transport_diagnostics_v1 = Readonly<{
  processRunning: boolean;
  processStarted: boolean;
  processExited: boolean;
  exitCode: number | null;
  exitSignal: string | null;
  stderrObserved: boolean;
  stderrTailSanitized: string;
  initializeResponse: boolean;
  protocolVersion: string | null;
  serverName: string | null;
  serverVersion: string | null;
  toolsListResponse: boolean;
  stderrRetainedBytes: number;
}>;

export function createDecibelMcpTimeoutErrorV1(request: string): Error {
  return new Error(`MCP_TOOL_TIMEOUT:${request}`);
}

export function classifyDecibelMcpProcessExitV1(
  initializeResponse: boolean,
  exitCode: number | null,
  signal: string | null,
): string {
  return `${initializeResponse ? 'MCP_PROCESS_EXITED' : 'MCP_PROCESS_EXIT_BEFORE_INITIALIZE'}:${exitCode ?? 'UNKNOWN'}:${signal ?? 'NONE'}`;
}

export function resolveDecibelMcpLauncherV1(environment: NodeJS.ProcessEnv): {
  executable: string;
  arguments: string[];
  sidecar: boolean;
  launchMode: 'PINNED_LOCAL_ENTRYPOINT' | 'NPX_LEGACY';
  npxUsed: boolean;
} {
  if (environment.DECIBEL_MCP_ENTRYPOINT) {
    const pinned = validateDecibelPinnedMcpRuntimeV1(environment);
    return {
      executable: pinned.nodeExecutable,
      arguments: [pinned.entrypoint],
      sidecar: true,
      launchMode: 'PINNED_LOCAL_ENTRYPOINT',
      npxUsed: false,
    };
  }
  const configuredNode = environment.DECIBEL_MCP_NODE_EXECUTABLE;
  if (configuredNode) {
    return {
      executable: configuredNode,
      arguments: [
        join(dirname(configuredNode), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
        '-y',
        '-p',
        '@decibeltrade/cli',
        'decibel-mcp',
      ],
      sidecar: true,
      launchMode: 'NPX_LEGACY',
      npxUsed: true,
    };
  }
  const windows = process.platform === 'win32';
  return windows
    ? {
        executable: process.env.ComSpec ?? 'cmd.exe',
        arguments: ['/d', '/s', '/c', 'npx -y -p @decibeltrade/cli decibel-mcp'],
        sidecar: false,
        launchMode: 'NPX_LEGACY',
        npxUsed: true,
      }
    : {
        executable: 'npx',
        arguments: ['-y', '-p', '@decibeltrade/cli', 'decibel-mcp'],
        sidecar: false,
        launchMode: 'NPX_LEGACY',
        npxUsed: true,
      };
}

export class decibel_mcp_stdout_framer_v1 {
  private buffer = '';
  constructor(
    private readonly OnMessage: (message: unknown) => void,
    private readonly OnMalformed: (line: string) => void,
  ) {}
  accept(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim().length === 0) continue;
      try {
        this.OnMessage(JSON.parse(line) as unknown);
      } catch {
        this.OnMalformed(line);
      }
    }
  }
  finish(): void {
    if (this.buffer.trim().length > 0) this.OnMalformed(this.buffer);
    this.buffer = '';
  }
}

export class decibel_mcp_stderr_capture_v1 {
  private value = '';
  constructor(
    private readonly Environment: NodeJS.ProcessEnv,
    private readonly MaximumBytes = 32 * 1024,
  ) {}
  append(chunk: string): void {
    let combined = `${this.value}${chunk}`;
    for (const key of [
      'DECIBEL_NODE_API_KEY',
      'DECIBEL_PRIVATE_KEY',
      'DECIBEL_SUBACCOUNT_ADDRESS',
    ]) {
      const value = this.Environment[key];
      if (value) combined = combined.split(value).join('[REDACTED]');
    }
    const bytes = Buffer.from(combined, 'utf8');
    this.value = bytes.subarray(Math.max(0, bytes.length - this.MaximumBytes)).toString('utf8');
  }
  observed(): boolean {
    return this.value.length > 0;
  }
  retainedBytes(): number {
    return Buffer.byteLength(this.value, 'utf8');
  }
  sanitizedTail(maximumCharacters = 2_000): string {
    let diagnostic = this.value.replace(/[\r\n]+/g, ' ').trim();
    for (const key of [
      'DECIBEL_NODE_API_KEY',
      'DECIBEL_PRIVATE_KEY',
      'DECIBEL_SUBACCOUNT_ADDRESS',
    ]) {
      const value = this.Environment[key];
      if (value) diagnostic = diagnostic.split(value).join('[REDACTED]');
    }
    return diagnostic.slice(-maximumCharacters);
  }
}

export class decibel_mock_mcp_transport_v1 implements DecibelMcpTransportV1 {
  readonly calls: Array<{ name: string; input: Readonly<Record<string, unknown>> }> = [];
  started = false;
  closed = false;
  readonly serverIdentity = { name: 'decibel-mock-mcp', version: '1' };

  constructor(
    private readonly Handler: (name: string, input: Readonly<Record<string, unknown>>) => unknown,
  ) {}

  start(): Promise<void> {
    this.started = true;
    return Promise.resolve();
  }

  callTool(name: string, input: Readonly<Record<string, unknown>>): Promise<unknown> {
    this.calls.push({ name, input });
    return Promise.resolve(this.Handler(name, input));
  }

  listTools(): Promise<unknown> {
    return this.callTool('__tools_list__', {});
  }

  getServerIdentity(): unknown {
    return this.serverIdentity;
  }

  getDiagnostics(): decibel_mcp_transport_diagnostics_v1 {
    return {
      processRunning: this.started && !this.closed,
      processStarted: this.started,
      processExited: this.closed,
      exitCode: null,
      exitSignal: null,
      stderrObserved: false,
      stderrTailSanitized: '',
      initializeResponse: this.started,
      protocolVersion: 'mock',
      serverName: this.serverIdentity.name,
      serverVersion: this.serverIdentity.version,
      toolsListResponse: this.calls.some((call) => call.name === '__tools_list__'),
      stderrRetainedBytes: 0,
    };
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

export class decibel_stdio_mcp_transport_v1 implements DecibelMcpTransportV1 {
  private process: ChildProcessWithoutNullStreams | null = null;
  private requestId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }
  >();
  private readonly Stderr: decibel_mcp_stderr_capture_v1;
  private serverIdentity: unknown = null;
  private processStarted = false;
  private processExited = false;
  private exitCode: number | null = null;
  private exitSignal: string | null = null;
  private initializeResponse = false;
  private protocolVersion: string | null = null;
  private toolsListResponse = false;

  constructor(
    private readonly Environment: NodeJS.ProcessEnv,
    private readonly StartupTimeoutMs = 60_000,
    private readonly ToolTimeoutMs = 15_000,
  ) {
    this.Stderr = new decibel_mcp_stderr_capture_v1(Environment);
  }

  async start(): Promise<void> {
    if (this.process !== null) return;
    const launcher = resolveDecibelMcpLauncherV1(this.Environment);
    const child = spawn(launcher.executable, launcher.arguments, {
      env: this.Environment,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    this.process = child;
    this.processStarted = true;
    this.emitDiagnostic('MCP_PROCESS_STARTED', 'YES');
    child.stderr.on('data', (chunk: Buffer) => {
      this.Stderr.append(chunk.toString('utf8'));
    });
    child.on('exit', (code, signal) => {
      this.process = null;
      this.processExited = true;
      this.exitCode = code;
      this.exitSignal = signal;
      const diagnostic = this.Stderr.sanitizedTail(500);
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(
          new Error(
            `${classifyDecibelMcpProcessExitV1(this.initializeResponse, code, signal)}${diagnostic.length > 0 ? `:${diagnostic}` : ''}`,
          ),
        );
      }
      this.pending.clear();
    });
    const framer = new decibel_mcp_stdout_framer_v1(
      (message) => this.acceptMessage(message),
      () => this.failPending('MCP_MALFORMED_JSON_RPC_RESPONSE'),
    );
    child.stdout.on('data', (chunk: Buffer) => framer.accept(chunk.toString('utf8')));
    child.stdout.on('end', () => framer.finish());
    const initialized = await this.request(
      'initialize',
      {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'decibel_btc_bot', version: '1' },
      },
      this.StartupTimeoutMs,
    );
    this.initializeResponse = true;
    const initializedRecord = asRecord(initialized);
    this.protocolVersion =
      typeof initializedRecord?.protocolVersion === 'string'
        ? initializedRecord.protocolVersion
        : null;
    this.serverIdentity = asRecord(initialized)?.serverInfo ?? null;
    this.emitDiagnostic('MCP_STDERR_OBSERVED', this.Stderr.observed() ? 'YES' : 'NO');
    this.emitDiagnostic('MCP_INITIALIZE_RESPONSE', 'YES');
    this.emitDiagnostic('MCP_PROTOCOL_VERSION', this.protocolVersion ?? 'UNKNOWN');
    const server = asRecord(this.serverIdentity);
    this.emitDiagnostic(
      'MCP_SERVER_NAME',
      typeof server?.name === 'string' ? server.name : 'UNKNOWN',
    );
    this.emitDiagnostic(
      'MCP_SERVER_VERSION',
      typeof server?.version === 'string' ? server.version : 'UNKNOWN',
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    );
  }

  callTool(name: string, input: Readonly<Record<string, unknown>>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: input }, this.ToolTimeoutMs);
  }

  async listTools(): Promise<unknown> {
    const result = await this.request('tools/list', {}, this.ToolTimeoutMs);
    this.toolsListResponse = true;
    this.emitDiagnostic('MCP_TOOLS_LIST_RESPONSE', 'YES');
    return result;
  }

  getServerIdentity(): unknown {
    return this.serverIdentity;
  }

  getDiagnostics(): decibel_mcp_transport_diagnostics_v1 {
    const server = asRecord(this.serverIdentity);
    return Object.freeze({
      processRunning: this.process !== null,
      processStarted: this.processStarted,
      processExited: this.processExited,
      exitCode: this.exitCode,
      exitSignal: this.exitSignal,
      stderrObserved: this.Stderr.observed(),
      stderrTailSanitized: this.Stderr.sanitizedTail(),
      initializeResponse: this.initializeResponse,
      protocolVersion: this.protocolVersion,
      serverName: typeof server?.name === 'string' ? server.name : null,
      serverVersion: typeof server?.version === 'string' ? server.version : null,
      toolsListResponse: this.toolsListResponse,
      stderrRetainedBytes: this.Stderr.retainedBytes(),
    });
  }

  close(): Promise<void> {
    const child = this.process;
    this.process = null;
    if (child === null) return Promise.resolve();
    child.stdin.end();
    if (!child.killed) {
      if (process.platform === 'win32' && child.pid !== undefined)
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      else child.kill();
    }
    return Promise.resolve();
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const child = this.process;
    if (child === null) return Promise.reject(new Error('MCP_PROCESS_NOT_RUNNING'));
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(createDecibelMcpTimeoutErrorV1(method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  private acceptMessage(value: unknown): void {
    const message = asRecord(value) as {
      id?: unknown;
      result?: unknown;
      error?: { message?: unknown };
    } | null;
    if (message === null) {
      this.failPending('MCP_MALFORMED_JSON_RPC_RESPONSE');
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error !== undefined) {
      const errorMessage =
        typeof message.error.message === 'string' ? message.error.message : 'UNKNOWN';
      pending.reject(new Error(`MCP_TOOL_ERROR:${errorMessage}`));
    } else pending.resolve(message.result);
  }

  private failPending(code: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(code));
    }
    this.pending.clear();
  }

  private emitDiagnostic(name: string, value: string): void {
    if (this.Environment.DECIBEL_MCP_DIAGNOSTICS === 'true') console.error(`${name}=${value}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
