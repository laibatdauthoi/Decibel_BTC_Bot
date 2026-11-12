import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SessionModal } from './session_modal_v1';
import {
  createSessionSharePngV1,
  downloadSessionSharePngV1,
  getOverviewShareRowsV1,
  type overview_share_data_v1,
} from './overview_share_v1';

export type share_copy_status_v1 = 'COPYING' | 'COPIED' | 'COPY_FAILED' | 'UNSUPPORTED';

/** Called synchronously by a click handler. Promise-valued ClipboardItem retains user activation. */
export function copySessionPngV1(png: Promise<Blob>): Promise<share_copy_status_v1> {
  if (
    !globalThis.isSecureContext ||
    typeof ClipboardItem === 'undefined' ||
    !navigator.clipboard?.write
  )
    return Promise.resolve('UNSUPPORTED');
  try {
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(
      () => 'COPIED' as const,
      () => 'COPY_FAILED' as const,
    );
  } catch {
    return Promise.resolve('COPY_FAILED');
  }
}

let NextPreviewId = 0;
export type share_preview_request_v1 = Readonly<{
  id: number;
  data: overview_share_data_v1;
  png: Promise<Blob>;
  rows: readonly (readonly [string, string])[];
}>;
export function startSessionShareV1(
  data: overview_share_data_v1,
  rows: readonly (readonly [string, string])[] = getOverviewShareRowsV1(data),
): share_preview_request_v1 {
  const png = createSessionSharePngV1(data, rows);
  void png.catch(() => undefined);
  return { id: ++NextPreviewId, data, png, rows };
}

export async function decodeSessionPngV1(blob: Blob): Promise<{ blob: Blob; url: string }> {
  if (blob.type !== 'image/png' || blob.size < 8) throw new Error('PNG_INVALID');
  const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value))
    throw new Error('PNG_INVALID');
  const url = URL.createObjectURL(blob);
  try {
    const Preview = new Image();
    Preview.src = url;
    await Preview.decode();
    if (Preview.naturalWidth <= 0 || Preview.naturalHeight <= 0)
      throw new Error('PNG_DECODE_FAILED');
    return { blob, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export const SharePreview = (
  props: Readonly<{ request: share_preview_request_v1; close: () => void }>,
) => {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [status, setStatus] = useState<share_copy_status_v1 | 'IDLE'>('IDLE');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const BlobRef = useRef<Blob | null>(null);
  const CopyVersion = useRef(0);
  const CopyBusy = useRef(false);
  const CopyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelCopyReset = (): void => {
    if (CopyResetTimer.current !== null) {
      clearTimeout(CopyResetTimer.current);
      CopyResetTimer.current = null;
    }
  };
  useEffect(() => {
    let active = true;
    let ownedUrl: string | null = null;
    setImage(null);
    setFailed(false);
    setStatus('IDLE');
    CopyBusy.current = false;
    const png = BlobRef.current
      ? Promise.resolve(BlobRef.current)
      : attempt === 0
        ? props.request.png
        : createSessionSharePngV1(props.request.data, props.request.rows);
    void png
      .then(async (blob) => {
        if (!active) return;
        BlobRef.current = blob;
        const decoded = await decodeSessionPngV1(blob);
        if (!active) {
          URL.revokeObjectURL(decoded.url);
          return;
        }
        ownedUrl = decoded.url;
        setImage(decoded);
      })
      .catch((error: unknown) => {
        if (active) {
          if (error instanceof Error && error.message === 'PNG_INVALID') BlobRef.current = null;
          setFailed(true);
        }
      });
    return () => {
      active = false;
      CopyVersion.current++;
      cancelCopyReset();
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [props.request, attempt]);
  const copyImage = () => {
    if (!image || failed || CopyBusy.current) return;
    cancelCopyReset();
    CopyBusy.current = true;
    const version = ++CopyVersion.current;
    setStatus('COPYING');
    void copySessionPngV1(Promise.resolve(image.blob)).then((result) => {
      if (CopyVersion.current !== version) return;
      CopyBusy.current = false;
      setStatus(result);
      if (result === 'COPIED') {
        CopyResetTimer.current = setTimeout(() => {
          CopyResetTimer.current = null;
          if (CopyVersion.current === version) setStatus('IDLE');
        }, 3000);
      }
    });
  };
  return (
    <SessionModal title="SHARE PREVIEW" close={props.close} className="session-share-preview">
      <div className="activity-modal-scroll">
        <div className="share-preview-image" aria-busy={!image && !failed}>
          {failed ? (
            <div role="status">
              <p>Preview unavailable. Check image loading and retry.</p>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                RETRY
              </button>
            </div>
          ) : image ? (
            <img
              src={image.url}
              alt={`Session card: ${props.request.data.sessionId}`}
              onError={() => {
                setFailed(true);
                setImage(null);
              }}
            />
          ) : (
            <p role="status">LOADING</p>
          )}
        </div>
        <div className="share-preview-actions">
          <button
            type="button"
            className={status === 'COPIED' && image && !failed ? 'share-copy-success' : undefined}
            disabled={!image || failed || status === 'COPYING'}
            onClick={copyImage}
            aria-live="polite"
          >
            {status === 'COPYING' ? (
              'COPYING...'
            ) : status === 'COPIED' && image && !failed ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  aria-hidden="true"
                >
                  <path d="m4 12 5 5 11-11" />
                </svg>{' '}
                COPIED
              </>
            ) : (
              'COPY IMAGE'
            )}
          </button>
          {(status === 'COPY_FAILED' || status === 'UNSUPPORTED') && (
            <span role="status">
              {status === 'COPY_FAILED'
                ? 'COPY FAILED'
                : 'Clipboard unavailable in this browser/context'}
            </span>
          )}
          <button
            type="button"
            disabled={!image || failed}
            onClick={() => {
              if (image) downloadSessionSharePngV1(image.blob, props.request.data.sessionId);
            }}
          >
            DOWNLOAD PNG
          </button>
        </div>
      </div>
    </SessionModal>
  );
};

export function useSessionSharePreviewV1() {
  const [request, setRequest] = useState<share_preview_request_v1 | null>(null);
  return {
    openShare: (data: overview_share_data_v1, rows?: readonly (readonly [string, string])[]) =>
      setRequest(startSessionShareV1(data, rows)),
    preview: request
      ? createPortal(
          <SharePreview key={request.id} request={request} close={() => setRequest(null)} />,
          document.body,
        )
      : null,
  };
}
