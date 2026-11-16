import {
  calculateOverviewCostPerMillionV1,
  formatShareCostPerMillionV1,
  getCostPerMillionDisplayValueV1,
  getOverviewShareRowsV1,
} from './overview_share_v1';
import { describe, expect, it } from 'vitest';

describe('Overview net trading cost and share presentation', () => {
  it('includes fees already inside canonical PnL without charging fees twice', () => {
    // Gross trading loss $10 + trading fees $2 => canonical PnL -$12.
    expect(calculateOverviewCostPerMillionV1(-12, 100000)).toBe(120);
    expect(calculateOverviewCostPerMillionV1(12, 100000)).toBe(-120);
    expect(calculateOverviewCostPerMillionV1(0, 100000)).toBe(0);
  });
  it('shows a cost as a red negative number and a profit as a green positive number', () => {
    expect(getCostPerMillionDisplayValueV1(120)).toBe(-120);
    expect(getCostPerMillionDisplayValueV1(-120)).toBe(120);
    expect(Object.is(getCostPerMillionDisplayValueV1(0), 0)).toBe(true);
    expect(getCostPerMillionDisplayValueV1(null)).toBeNull();
    expect(getCostPerMillionDisplayValueV1(NaN)).toBeNull();
    expect(formatShareCostPerMillionV1(120)).toMatch(/^-\$120\.00$/);
    expect(formatShareCostPerMillionV1(-120)).toMatch(/^\+\$120\.00$/);
    expect(formatShareCostPerMillionV1(0)).toMatch(/^\$0\.00$/);
    expect(formatShareCostPerMillionV1(null)).toBe('UNVERIFIED');
  });
  it('does not fabricate costs when volume or PnL evidence is missing', () => {
    for (const [pnl, volume] of [
      [null, 100],
      [-1, null],
      [-1, 0],
      [-1, -1],
      [NaN, 100],
      [-1, Infinity],
    ]) {
      expect(calculateOverviewCostPerMillionV1(pnl ?? null, volume ?? null)).toBeNull();
    }
  });
  it('exports only requested session presentation fields and no credentials', () => {
    const rows = getOverviewShareRowsV1({
      sessionId: 'session-test',
      status: 'RUNNING',
      action: 'HOLD',
      progress: '$30 / $100 | 30%',
      elapsed: '00:00:10',
      capital: '$8',
      pnl: '-$0.50',
      maxLoss: '$0.50 / $2',
      target: '$100',
      volume: '$30',
      observedAt: 20000,
    });
    expect(rows.map(([label]) => label)).toEqual([
      'Bot Status',
      'Current Action',
      'Progress',
      'Elapsed Time',
      'Capital',
      'Session PnL',
      'Max Loss',
      'Target Volume',
      'Executed Volume',
      'COST / 1M VOL',
    ]);
    expect(rows.find(([label]) => label === 'Session PnL')?.[1]).toBe('-$0.50');
  });
});

it('exports PNG bytes and dimensions in Chromium without sending data or submitting commands', async (context) => {
  const { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { spawn } = await import('node:child_process');
  const { transpileModule, ScriptTarget, ModuleKind } = await import('typescript');
  const browser = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  if (!browser) {
    context.skip();
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'decibel-share-card-'));
  try {
    const compiled = transpileModule(
      readFileSync('web_dashboard/src/overview_share_v1.ts', 'utf8').replace(
        "'/branding/mm-logo.png'",
        JSON.stringify(
          'data:image/png;base64,' +
            readFileSync('web_dashboard/public/branding/mm-logo.png').toString('base64'),
        ),
      ),
      { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext } },
    ).outputText;
    const fontDirectory = resolve('node_modules/@fontsource/fredoka');
    const fontCSS = [400, 500]
      .map((weight) =>
        readFileSync(join(fontDirectory, `latin-${weight}.css`), 'utf8').replace(
          /url\(([^)]+)\)/g,
          (_match: string, path: string) =>
            `url(${pathToFileURL(join(fontDirectory, path.replace(/['"]/g, ''))).href})`,
        ),
      )
      .join('');
    const html = join(root, 'share.html');
    writeFileSync(
      html,
      `<!doctype html><style>${fontCSS}</style><span style="font-family:Fredoka;font-weight:400">PNG</span><span style="font-family:Fredoka;font-weight:500">EXPORT</span><pre id="result">pending</pre><script type="module">${compiled}
      document.getElementById('result').textContent = 'SCRIPT_STARTED';
      const downloads = [];
      let exportedBlob;
      const originalCreateURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { exportedBlob = blob; return originalCreateURL(blob); };
      HTMLAnchorElement.prototype.click = function () { downloads.push({name:this.download,url:this.href}); };
      const renderGeometry = [];
      const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (args.length === 5) renderGeometry.push({x:args[1],y:args[2],width:args[3],height:args[4],alpha:this.globalAlpha});
        return originalDrawImage.apply(this,args);
      };
      try {
        document.getElementById('result').textContent='ENCODING';
        await downloadOverviewShareCardV1({sessionId:'test/session',status:'RUNNING',action:'HOLD',progress:'$30 / $100 | 30%',elapsed:'00:00:10',capital:'$8',pnl:'-$0.50',maxLoss:'$0.50 / $2',target:'$100',volume:'$30',observedAt:20000});
        document.getElementById('result').textContent='DECODING';
        const buffer = await exportedBlob.arrayBuffer();
        const header = new DataView(buffer);
        const countLogoPixels = async (blob, region = 'left') => {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
          const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
          const pixels = (region === 'body' ? ctx.getImageData(660, 120, 492, 640) : region === 'header' ? ctx.getImageData(1052, 10, 100, 100) : ctx.getImageData(48, 12, 96, 96)).data;
          bitmap.close();
          let count = 0;
          for (let i=0;i<pixels.length;i+=4) if (pixels[i]>180 && ((pixels[i+1]>150 && pixels[i+2]<100) || (pixels[i]>pixels[i+1]*1.3 && pixels[i+2]>100))) count++;
          return count;
        };
        const runningLogoPixels = await countLogoPixels(exportedBlob); const runningBrandMarkPixels = await countLogoPixels(exportedBlob, 'body');
        const historical = await createSessionSharePngV1({sessionId:'history',status:'STOPPED',action:'COMPLETE',progress:'100%',elapsed:'00:01:00',capital:'$8',pnl:'-$0.50',maxLoss:'$2',target:'$100',volume:'$100',observedAt:20000}, [['Final Status','STOPPED'],['Duration','00:01:00'],['Capital','$8'],['Session PnL','-$0.50'],['Executed Volume','$100'],['Fills','2'],['Cost / 1M Vol','$5000'],['Target Volume','$100'],['Target Progress','100%']]);
        const emptyHeaderPixels = await countLogoPixels(exportedBlob, 'header'); const historicalBuffer = await historical.arrayBuffer(); const historicalLogoPixels = await countLogoPixels(historical); const historicalBrandMarkPixels = await countLogoPixels(historical, 'body');
        const encodeDataUrl = buffer => 'data:image/png;base64,'+btoa(Array.from(new Uint8Array(buffer),byte=>String.fromCharCode(byte)).join(''));
        document.getElementById('result').textContent = JSON.stringify({renderGeometry,emptyHeaderPixels,runningBrandMarkPixels,historicalBrandMarkPixels,runningLogoPixels,historicalLogoPixels,downloads:downloads.length,name:downloads[0].name,type:exportedBlob.type,width:header.getUint32(16),height:header.getUint32(20),signature:Array.from(new Uint8Array(buffer,0,8)),bytes:exportedBlob.size,dataUrl:${Boolean(process.env.DECIBEL_OVERVIEW_RENDER_DIR)} ? encodeDataUrl(buffer) : null,historicalDataUrl:${Boolean(process.env.DECIBEL_OVERVIEW_RENDER_DIR)} ? encodeDataUrl(historicalBuffer) : null});
      } catch (error) { document.getElementById('result').textContent=JSON.stringify({error:String(error)}); }
    </script>`,
    );
    const Browser = spawn(
      browser,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--remote-debugging-port=0',
        '--user-data-dir=' + join(root, 'profile'),
        'about:blank',
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const browserExit = new Promise<void>((resolve) => Browser.once('exit', () => resolve()));
    let output = '';
    try {
      const endpoint = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('CHROMIUM_START_TIMEOUT')), 10000);
        Browser.once('error', reject);
        Browser.stderr.on('data', (chunk: Buffer) => {
          const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
      });
      const pages = (await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json()) as {
        webSocketDebuggerUrl: string;
        type: string;
      }[];
      const Socket = new WebSocket(
        pages.find((page) => page.type === 'page')!.webSocketDebuggerUrl,
      );
      await new Promise<void>((resolve) =>
        Socket.addEventListener('open', () => resolve(), { once: true }),
      );
      let sequence = 0;
      const sendCommand = (method: string, params: object): Promise<string> =>
        new Promise((resolve) => {
          const id = ++sequence;
          const receive = (event: MessageEvent): void => {
            const reply = JSON.parse(String(event.data)) as { id?: number };
            if (reply.id === id) {
              Socket.removeEventListener('message', receive);
              resolve(String(event.data));
            }
          };
          Socket.addEventListener('message', receive);
          Socket.send(JSON.stringify({ id, method, params }));
        });
      try {
        await sendCommand('Page.navigate', { url: pathToFileURL(html).href });
        for (let attempt = 0; attempt < 100; attempt++) {
          const reply = JSON.parse(
            await sendCommand('Runtime.evaluate', {
              expression: 'document.documentElement.outerHTML',
              returnByValue: true,
            }),
          ) as { result: { result: { value?: string } } };
          output = reply.result.result.value ?? '';
          if (output.includes('<pre id="result">{')) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const directory = process.env.DECIBEL_OVERVIEW_RENDER_DIR;
        if (directory && output.includes('<pre id="result">{')) {
          const { mkdirSync } = await import('node:fs');
          mkdirSync(directory, { recursive: true });
          const css = readFileSync('web_dashboard/src/styles.css', 'utf8');
          const logo =
            'data:image/png;base64,' +
            readFileSync('web_dashboard/public/branding/mm-logo.png').toString('base64');
          await sendCommand('Runtime.evaluate', {
            expression: `(() => {
              const result = JSON.parse(document.getElementById('result').textContent);
              document.head.insertAdjacentHTML('beforeend', '<style>' + ${JSON.stringify(css)} + '</style>');
              document.body.innerHTML = '<main class="app-shell"><header class="top-bar"><button class="wordmark"><img class="wordmark-logo" alt="" src="${logo}">DECIBEL / MM V1</button><nav><button>[ OVERVIEW ]</button><button>[ ACTIVITY ]</button><button>[ SETTINGS ]</button></nav></header><div style="margin:32px auto;max-width:900px"><h2>SHARE PREVIEW — READ-ONLY FIXTURE</h2><img style="width:100%" src="' + result.dataUrl + '"></div></main>';
            })()`,
          });
          for (const width of [1280, 1440]) {
            await sendCommand('Emulation.setDeviceMetricsOverride', {
              width,
              height: 1000,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            const shot = JSON.parse(
              await sendCommand('Page.captureScreenshot', { format: 'png' }),
            ) as { result: { data: string } };
            writeFileSync(
              join(directory, `header_preview_${width}.png`),
              Buffer.from(shot.result.data, 'base64'),
            );
          }
        }
      } finally {
        Socket.close();
      }
    } finally {
      Browser.kill();
      await browserExit;
    }
    const match = output.match(/<pre id="result">(.*?)<\/pre>/s);
    expect(match).not.toBeNull();
    expect(match![1]).not.toMatch(/pending|SCRIPT_STARTED|ENCODING|DECODING/);
    const result: unknown = JSON.parse(match![1]);
    const pixels = result as {
      runningLogoPixels: number;
      historicalLogoPixels: number;
      runningBrandMarkPixels: number;
      historicalBrandMarkPixels: number;
      emptyHeaderPixels: number;
    };
    expect(typeof pixels.runningLogoPixels).toBe('number');
    expect(typeof pixels.historicalLogoPixels).toBe('number');
    expect(pixels.runningLogoPixels).toBeGreaterThan(100);
    expect(pixels.historicalLogoPixels).toBe(pixels.runningLogoPixels);
    expect(pixels.runningBrandMarkPixels).toBeGreaterThan(10000);
    expect(pixels.historicalBrandMarkPixels).toBeGreaterThan(10000);
    expect(pixels.emptyHeaderPixels).toBe(0);
    const directory = process.env.DECIBEL_OVERVIEW_RENDER_DIR;
    if (
      directory &&
      typeof result === 'object' &&
      result !== null &&
      'dataUrl' in result &&
      typeof result.dataUrl === 'string'
    ) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'share_card.png'),
        Buffer.from(result.dataUrl.split(',')[1] ?? '', 'base64'),
      );
      if ('renderGeometry' in result) {
        writeFileSync(
          join(directory, 'render_geometry.json'),
          JSON.stringify(result.renderGeometry, null, 2),
        );
      }
      if ('historicalDataUrl' in result && typeof result.historicalDataUrl === 'string') {
        writeFileSync(
          join(directory, 'share_card_historical.png'),
          Buffer.from(result.historicalDataUrl.split(',')[1] ?? '', 'base64'),
        );
      }
    }
    expect(result).toMatchObject({
      downloads: 1,
      name: 'decibel_session_test_session.png',
      type: 'image/png',
      signature: [137, 80, 78, 71, 13, 10, 26, 10],
      width: 1200,
      height: 900,
      renderGeometry: [{ alpha: 1 }, { alpha: 0.75 }, { alpha: 1 }, { alpha: 0.75 }],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20000);
