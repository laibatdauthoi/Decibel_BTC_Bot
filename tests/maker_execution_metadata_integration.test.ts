import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { validateMakerMarketMetadata } from '../src/maker_execution_simulator.js';
import { microstructure_repository } from '../src/microstructure_repository.js';
import { createResearchMarketMetadata } from '../src/research_market_metadata.js';
import {
  research_dataset_repository,
  research_source_repository,
} from '../src/research_repository.js';

const directories: string[] = [];
const market = {
  symbol: 'BTC/USD' as const,
  exchangeSymbol: 'BTC-USD',
  marketAddress: '0xbtc',
  sizeDecimals: 8,
  priceDecimals: 2,
  tickSize: 0.5,
  minimumSize: 0.001,
  lotSize: 0.0001,
  maximumLeverage: 20,
  maximumOpenInterest: 1_000,
  mode: 'Open' as const,
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function paths(): { research: string; microstructure: string } {
  const directory = mkdtempSync(join(tmpdir(), 'maker-metadata-'));
  directories.push(directory);
  return {
    research: join(directory, 'research.sqlite'),
    microstructure: join(directory, 'microstructure.sqlite'),
  };
}

describe('maker execution metadata integration', () => {
  it('fails actionably when research metadata is missing', () => {
    expect(() => validateMakerMarketMetadata(null, ['0xbtc'], '0xbtc')).toThrow(
      'run npm run build:research-dataset first',
    );
  });

  it('rejects candidate and microstructure market mismatches', () => {
    const metadata = createResearchMarketMetadata(market, new Date(1_000));
    expect(() => validateMakerMarketMetadata(metadata, ['0xother'], '0xbtc')).toThrow(
      'Research candidate market address',
    );
    expect(() => validateMakerMarketMetadata(metadata, ['0xbtc'], '0xother')).toThrow(
      'Microstructure market address',
    );
  });

  it('upserts an identical normalized snapshot deterministically', () => {
    const { research } = paths();
    const Repository = new research_dataset_repository(research);
    const first = createResearchMarketMetadata(market, new Date(1_000));
    const repeated = createResearchMarketMetadata(market, new Date(9_000));
    expect(Repository.saveMarketMetadata(first)).toBe('inserted');
    expect(Repository.saveMarketMetadata(repeated)).toBe('unchanged');
    expect(Repository.getMarketMetadata(market.marketAddress)).toEqual(first);
    Repository.close();
  });

  it('starts from persisted research metadata against the real production microstructure schema', () => {
    const { research, microstructure } = paths();
    const MicrostructureRepository = new microstructure_repository(microstructure);
    MicrostructureRepository.startCollectorSession(market.marketAddress, 1_000);
    MicrostructureRepository.saveBatch(
      [],
      [],
      [],
      [
        {
          marketAddress: market.marketAddress,
          secondTimestamp: new Date(1_000),
          buyVolume: 0,
          sellVolume: 0,
          unknownVolume: 0,
          tradeCount: 0,
          vwap: null,
          spread: null,
          depthImbalance: null,
          orderFlowImbalance: 0,
          bookAgeMs: null,
          marketPriceAgeMs: null,
          markPrice: null,
          midPrice: null,
          oraclePrice: null,
          fundingRate: null,
          openInterest: null,
        },
      ],
    );
    MicrostructureRepository.close();
    const DatasetRepository = new research_dataset_repository(research);
    const metadata = createResearchMarketMetadata(market, new Date(2_000));
    DatasetRepository.saveMarketMetadata(metadata);
    const SourceRepository = new research_source_repository(microstructure);
    expect(SourceRepository.getMarketAddresses()).toEqual([market.marketAddress]);
    const source = SourceRepository.loadSource(market.marketAddress, 3_000);
    expect(
      validateMakerMarketMetadata(
        DatasetRepository.getMarketMetadata(market.marketAddress),
        [market.marketAddress],
        source.marketAddress,
      ),
    ).toEqual(metadata);
    SourceRepository.close();
    DatasetRepository.close();
  });

  it('applies the research migration idempotently without changing existing rows', () => {
    const { research } = paths();
    const FirstRepository = new research_dataset_repository(research);
    FirstRepository.saveMarketMetadata(createResearchMarketMetadata(market, new Date(1_000)));
    FirstRepository.close();
    const ReopenedRepository = new research_dataset_repository(research);
    ReopenedRepository.close();
    const InspectionDatabase = new Database(research, { readonly: true });
    expect(InspectionDatabase.pragma('user_version', { simple: true })).toBe(3);
    expect(
      InspectionDatabase.prepare(
        'SELECT COUNT(*) AS count FROM research_market_metadata_snapshots',
      ).get(),
    ).toEqual({ count: 1 });
    InspectionDatabase.close();
  });
});
