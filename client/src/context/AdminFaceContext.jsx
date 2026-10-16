import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../lib/api';
import FaceCapture from '../components/FaceCapture.jsx';
import { Modal } from '../components/ui.jsx';

const Ctx = createContext(null);
export const useAdminFace = () => useContext(Ctx);

/**
 * Sensitive admin actions are wrapped like:
 *    withProof((cfg) => api.post('/users', data, cfg))
 * If the admin has not scanned their face in the last few minutes, a face-scan window opens first.
 */
export function AdminFaceProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const proof = useRef({ token: '', exp: 0 });

  useEffect(() => {
    api.get('/auth/config').then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  const ensureProof = useCallback(() => {
    if (config && !config.faceRequired) return Promise.resolve('');
    if (proof.current.token && Date.now() < proof.current.exp - 5000) return Promise.resolve(proof.current.token);
    return new Promise((resolve, reject) => setPending({ resolve, reject }));
  }, [config]);

  const withProof = useCallback(
    async (fn) => {
      let token;
      try { token = await ensureProof(); } catch { return undefined; } // admin closed the window
      const cfg = (t) => (t ? { headers: { 'x-face-proof': t } } : {});
      try {
        return await fn(cfg(token));
      } catch (err) {
        if (err.response?.data?.code !== 'FACE_PROOF_REQUIRED') throw err;
        proof.current = { token: '', exp: 0 }; // expired on the server: scan again, retry once
        try { token = await ensureProof(); } catch { return undefined; }
        return fn(cfg(token));
      }
    },
    [ensureProof]
  );

  const onScan = async (descriptors) => {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/face/verify-admin', { descriptors });
      proof.current = { token: data.proof, exp: Date.now() + data.expiresInSeconds * 1000 };
      pending.resolve(data.proof);
      setPending(null);
    } catch (err) {
      toast.error(errMsg(err));
      setKey((k) => k + 1); // fresh attempt
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    pending?.reject(new Error('cancelled'));
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ withProof }}>
      {children}
      {pending && (
        <Modal title="Admin face check" onClose={close}>
          <p className="mb-4 text-sm text-ink-500">This action changes who can access the system. Scan your face to confirm it is really you.</p>
          <FaceCapture key={key} mode="verify" onDone={onScan} busy={busy} />
        </Modal>
      )}
    </Ctx.Provider>
  );
}
