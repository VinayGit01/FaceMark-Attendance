import { useCallback, useEffect, useRef, useState } from 'react';

const messageFor = (e) => {
  if (e.name === 'NotAllowedError') return 'Camera access was blocked. Allow the camera in your browser address bar and try again.';
  if (e.name === 'NotReadableError') return 'The camera is being used by another app or browser tab. Close it and try again.';
  return 'No camera found. Connect a webcam and try again.';
};

export default function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      let stream;
      try {
        // Sharper picture = easier recognition. Fall back to anything the camera offers.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
          audio: false,
        });
      } catch (e) {
        if (e.name !== 'OverconstrainedError') throw e;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
        setReady(true);
      }
    } catch (e) {
      setError(messageFor(e));
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, ready, error, start, stop };
}
