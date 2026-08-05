import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { resolve } from 'node:path';

function getLockPort(databasePath: string): number {
  const digest = createHash('sha256').update(resolve(databasePath).toLowerCase()).digest();
  return 42_000 + (digest.readUInt16BE(0) % 10_000);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolveListen, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error === undefined ? resolveClose() : reject(error)));
  });
}

export class database_runtime_lock {
  private readonly servers: Server[] = [];
  private released = false;

  static async acquire(databasePaths: readonly string[]): Promise<database_runtime_lock> {
    const lock = new database_runtime_lock();
    const uniquePaths = [...new Set(databasePaths.map((path) => resolve(path)))].sort();
    try {
      for (const databasePath of uniquePaths) {
        const server = createServer();
        const port = getLockPort(databasePath);
        try {
          await listen(server, port);
        } catch (error) {
          server.close();
          const code = error instanceof Error && 'code' in error ? String(error.code) : '';
          if (code === 'EADDRINUSE')
            throw new Error(
              `Database writer lock is already held for ${databasePath}; stop the standalone or unified collector using this database`,
              { cause: error },
            );
          throw error;
        }
        lock.servers.push(server);
      }
      return lock;
    } catch (error) {
      await lock.release();
      throw error;
    }
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await Promise.all(this.servers.splice(0).map((server) => close(server)));
  }
}
