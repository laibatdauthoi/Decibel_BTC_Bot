import dotenv from 'dotenv';

dotenv.config();

import { createDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_v1.js';

const Source = createDecibelProductionLiveStateSourceV1({ environment: process.env });
try {
  for (let index = 1; index <= 2; index += 1) {
    const snapshot = await Source.readAuthenticatedAccountState();
    console.log(
      JSON.stringify({
        snapshot: index,
        authReady: true,
        observedAt: snapshot.observedAt,
        positionBase: snapshot.actualInventoryBase,
        openOrders: snapshot.openOrders.length,
      }),
    );
    if (index === 1) await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
} catch (error) {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && messages.length < 8) {
    messages.push(current.message);
    current = current.cause;
  }
  console.log(
    JSON.stringify({
      authReady: false,
      error: messages.length > 0 ? messages.join(':') : String(error),
    }),
  );
  process.exitCode = 2;
} finally {
  await Source.close?.();
}
