import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export type decibel_source_build_fingerprint_v1 = Readonly<{
  buildId: string;
  sourceBuildTimestamp: number;
  coveredFileCount: number;
}>;

const productionSourceRoots = Object.freeze(['src', 'web_dashboard/src']);
const productionConfigurationFiles = Object.freeze([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.production.json',
  'web_dashboard/package.json',
  'web_dashboard/vite.config.ts',
]);

function listFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const status = statSync(path);
  if (status.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => listFiles(resolve(path, entry.name)))
    .filter((file) => /\.(?:ts|tsx|mjs|json)$/u.test(file));
}

export function calculateDecibelSourceBuildFingerprintV1(
  projectRoot = process.cwd(),
): decibel_source_build_fingerprint_v1 {
  const root = resolve(projectRoot);
  const files = [
    ...productionSourceRoots.flatMap((path) => listFiles(resolve(root, path))),
    ...productionConfigurationFiles
      .map((path) => resolve(root, path))
      .filter((path) => existsSync(path) && statSync(path).isFile()),
  ]
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
  if (files.length === 0) throw new Error('PRODUCTION_SOURCE_BUILD_FINGERPRINT_EMPTY');
  const Hash = createHash('sha256');
  let sourceBuildTimestamp = 0;
  for (const path of files) {
    const relativePath = relative(root, path).replaceAll('\\', '/');
    const status = statSync(path);
    sourceBuildTimestamp = Math.max(sourceBuildTimestamp, Math.trunc(status.mtimeMs));
    Hash.update(relativePath);
    Hash.update('\0');
    Hash.update(readFileSync(path));
    Hash.update('\0');
  }
  return Object.freeze({
    buildId: Hash.digest('hex').slice(0, 16),
    sourceBuildTimestamp,
    coveredFileCount: files.length,
  });
}
