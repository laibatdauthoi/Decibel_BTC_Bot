export type paper_bot_signal_source = {
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
};

export async function awaitPaperBotShutdownSignal(
  source: paper_bot_signal_source,
  shutdown: (signal: 'SIGINT' | 'SIGTERM') => Promise<void>,
) {
  let shared: Promise<void> | undefined;
  await new Promise<void>((resolve, reject) => {
    const removeHandlers = () => {
        source.off('SIGINT', onSIGINT);
        source.off('SIGTERM', onSIGTERM);
      },
      handle = (signal: 'SIGINT' | 'SIGTERM') => {
        shared ??= shutdown(signal);
        void shared.then(
          () => {
            removeHandlers();
            resolve();
          },
          (error: unknown) => {
            removeHandlers();
            reject(error instanceof Error ? error : new Error('Paper bot shutdown failed'));
          },
        );
      },
      onSIGINT = () => handle('SIGINT'),
      onSIGTERM = () => handle('SIGTERM');
    source.on('SIGINT', onSIGINT);
    source.on('SIGTERM', onSIGTERM);
  });
}
