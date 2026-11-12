import { describe, expect, it } from 'vitest';

import {
  classifyDecibelMarketRegimeV1,
  loadDecibelRegimeEdgeModelV1,
  selectDecibelRegimeSideEdgeV1,
} from '../src/decibel_regime_edge_gate_v1.js';

describe('Decibel regime edge gate V1', () => {
  const model = loadDecibelRegimeEdgeModelV1('config/decibel_regime_edge_model_v1.json');

  it('classifies five-minute price regimes deterministically', () => {
    expect(
      classifyDecibelMarketRegimeV1(
        [
          { at: 0, midpoint: 100 },
          { at: 300_000, midpoint: 100.1 },
        ],
        300_000,
        300_000,
        2,
      ),
    ).toBe('RISING');
    expect(classifyDecibelMarketRegimeV1([{ at: 0, midpoint: 100 }], 0, 300_000, 2)).toBe(
      'UNKNOWN',
    );
  });

  it('allows each side independently only with sufficient positive evidence', () => {
    expect(selectDecibelRegimeSideEdgeV1(model, 'FALLING', 'BUY')).toMatchObject({
      eligible: true,
      distanceBps: 6,
      sampleCount: 75,
    });
    expect(selectDecibelRegimeSideEdgeV1(model, 'FALLING', 'SELL')).toMatchObject({
      eligible: true,
      distanceBps: 7,
      sampleCount: 51,
    });
    expect(selectDecibelRegimeSideEdgeV1(model, 'NEUTRAL', 'SELL')).toMatchObject({
      eligible: false,
      distanceBps: null,
    });
    expect(selectDecibelRegimeSideEdgeV1(model, 'RISING', 'SELL')).toMatchObject({
      eligible: false,
      distanceBps: null,
    });
  });
});
