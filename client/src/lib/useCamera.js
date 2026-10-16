import { useCallback, useEffect, useRef, useState } from 'react';

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
        setReady(true);
      }
    } catch (e) {
      setError(
        e.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera in your browser address bar and try again.'
          : 'No camera found. Connect a webcam and try again.'
      );
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, ready, error, start, stop };
}
