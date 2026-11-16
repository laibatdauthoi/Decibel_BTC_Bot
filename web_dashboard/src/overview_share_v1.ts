export type overview_share_data_v1 = Readonly<{
  sessionId: string;
  status: string;
  action: string;
  progress: string;
  elapsed: string;
  capital: string;
  pnl: string;
  maxLoss: string;
  target: string;
  volume: string;
  observedAt: number;
  costPerMillion?: number | null;
}>;

export function calculateOverviewCostPerMillionV1(
  pnlUsd: number | null,
  volumeUsd: number | null,
): number | null {
  if (
    pnlUsd === null ||
    volumeUsd === null ||
    !Number.isFinite(pnlUsd) ||
    !Number.isFinite(volumeUsd) ||
    volumeUsd <= 0
  )
    return null;
  const cost = (-pnlUsd / volumeUsd) * 1_000_000;
  return Number.isFinite(cost) ? (cost === 0 ? 0 : cost) : null;
}

export function getOverviewShareRowsV1(
  data: overview_share_data_v1,
): readonly (readonly [string, string])[] {
  return [
    ['Bot Status', data.status],
    ['Current Action', data.action],
    ['Progress', data.progress],
    ['Elapsed Time', data.elapsed],
    ['Capital', data.capital],
    ['Session PnL', data.pnl],
    ['Max Loss', data.maxLoss],
    ['Target Volume', data.target],
    ['Executed Volume', data.volume],
    ['COST / 1M VOL', formatShareCostPerMillionV1(data.costPerMillion ?? null)],
  ];
}

/**
 * Display value of a cost per 1M volume, signed like PnL: a loss is negative (red, "-"),
 * a profit is positive (green, "+").
 */
export function getCostPerMillionDisplayValueV1(cost: number | null): number | null {
  if (cost === null || !Number.isFinite(cost)) return null;
  return cost === 0 ? 0 : -cost;
}

export function formatShareCostPerMillionV1(value: number | null): string {
  const display = getCostPerMillionDisplayValueV1(value);
  return display === null
    ? 'UNVERIFIED'
    : (display > 0 ? '+' : '') +
        display.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
}

/** One PNG renderer for Overview, Activity, preview, clipboard and explicit downloads. */
export async function createSessionSharePngV1(
  data: overview_share_data_v1,
  rows: readonly (readonly [string, string])[] = getOverviewShareRowsV1(data),
): Promise<Blob> {
  await document.fonts.ready;
  const Logo = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      Logo.onload = () => resolve();
      Logo.onerror = () => reject(new Error('SHARE_CARD_LOGO_UNAVAILABLE'));
      Logo.src = '/branding/mm-logo.png';
    });
    await Logo.decode();
  } catch {
    throw new Error('SHARE_CARD_LOGO_UNAVAILABLE');
  }
  if (Logo.naturalWidth <= 0 || Logo.naturalHeight <= 0)
    throw new Error('SHARE_CARD_LOGO_UNAVAILABLE');
  const Canvas = document.createElement('canvas');
  Canvas.width = 1200;
  Canvas.height = 900;
  const Context = Canvas.getContext('2d');
  if (!Context) throw new Error('SHARE_CARD_CANVAS_UNAVAILABLE');
  Context.fillStyle = '#eeeade';
  Context.fillRect(0, 0, 1200, 900);
  Context.fillStyle = '#090a0b';
  Context.fillRect(0, 0, 1200, 120);
  Context.fillStyle = '#f5f1e7';
  Context.font = '500 40px Fredoka, sans-serif';
  const logoHeight = 96;
  const logoWidth = (Logo.naturalWidth / Logo.naturalHeight) * logoHeight;
  Context.drawImage(Logo, 48, (120 - logoHeight) / 2, logoWidth, logoHeight);
  Context.fillText('DECIBEL / MM V1', 48 + logoWidth + 14, 76);
  const valueLeft = 475;
  const valueMaxWidth = Canvas.width * 0.75 - 24 - valueLeft;
  Context.font = '500 27px Fredoka, sans-serif';
  const valueRight = Math.max(
    valueLeft,
    ...rows.map(
      ([, value]) => valueLeft + Math.min(Context.measureText(value).width, valueMaxWidth),
    ),
  );
  const bodyLogoLeft = Math.max(Canvas.width * 0.55, valueRight + 32);
  const bodyLogoRight = Canvas.width - 48;
  const bodyLogoTop = 120;
  const bodyLogoBottom = Canvas.height - 140;
  const logoScale = Math.min(
    ((bodyLogoRight - bodyLogoLeft) * 0.7) / Logo.naturalWidth,
    ((bodyLogoBottom - bodyLogoTop) * 0.52) / Logo.naturalHeight,
  );
  const bodyLogoWidth = Logo.naturalWidth * logoScale * 1.5;
  const bodyLogoHeight = Logo.naturalHeight * logoScale * 1.5;
  Context.save();
  Context.globalAlpha = 0.75;
  Context.drawImage(
    Logo,
    bodyLogoLeft + (bodyLogoRight - bodyLogoLeft - bodyLogoWidth) / 2,
    bodyLogoTop + (bodyLogoBottom - bodyLogoTop - bodyLogoHeight) / 2,
    bodyLogoWidth,
    bodyLogoHeight,
  );
  Context.restore();
  for (const [index, [label, value]] of rows.entries()) {
    const y = 180 + index * (rows.length > 9 ? 60 : 66);
    Context.fillStyle = '#77766f';
    Context.font = '400 23px Fredoka, sans-serif';
    Context.fillText(label.toUpperCase(), 48, y, 400);
    Context.fillStyle = label === 'Session PnL' && value.includes('-') ? '#dc2753' : '#0a0b0c';
    Context.font = '500 27px Fredoka, sans-serif';
    Context.fillText(value, valueLeft, y, valueMaxWidth);
  }
  Context.fillStyle = '#77766f';
  Context.font = '400 18px Fredoka, sans-serif';
  Context.fillText(
    'Net trading cost uses canonical PnL after trading fees; funding and gas excluded.',
    48,
    800,
  );
  Context.fillText('Snapshot: ' + new Date(data.observedAt).toISOString(), 48, 836);
  const blob = await new Promise<Blob>((resolve, reject) =>
    Canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('SHARE_CARD_ENCODING_FAILED'))),
      'image/png',
    ),
  );
  return blob;
}

export function downloadSessionSharePngV1(blob: Blob, sessionId: string): void {
  const url = URL.createObjectURL(blob);
  const Link = document.createElement('a');
  Link.href = url;
  Link.download = `decibel_session_${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  Link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadOverviewShareCardV1(
  data: overview_share_data_v1,
  rows: readonly (readonly [string, string])[] = getOverviewShareRowsV1(data),
): Promise<void> {
  downloadSessionSharePngV1(await createSessionSharePngV1(data, rows), data.sessionId);
}
