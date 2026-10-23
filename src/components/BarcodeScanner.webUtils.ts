import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export function createBarcodeHints(): Map<DecodeHintType, any> {
  return new Map([[DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]]]);
}

export function stopMediaStream(stream: unknown): void {
  if (typeof stream !== 'object' || stream === null || !('getTracks' in stream)) return;
  const getTracks = stream.getTracks;
  if (typeof getTracks !== 'function') return;
  for (const track of getTracks.call(stream)) track.stop();
}

export function getCameraSupportMessage(secureContext: boolean, hasGetUserMedia: boolean): string | undefined {
  if (!secureContext) return 'Camera scanning requires a secure HTTPS connection. Enter the barcode below instead.';
  if (!hasGetUserMedia) return 'This browser does not support camera access. Enter the barcode below instead.';
  return undefined;
}

export function getCameraErrorMessage(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was blocked. Allow camera access for this site in Safari Settings, then try again, or enter the barcode below.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found. Connect a camera or enter the barcode below.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The camera could not start. Close other apps using the camera and try again, or enter the barcode below.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'The rear camera could not be started. Check your camera settings or enter the barcode below.';
  }
  return 'The camera could not be started. Check Safari camera permissions and try again, or enter the barcode below.';
}
