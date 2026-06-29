import { useState, useEffect, useCallback, useRef } from 'react';
import { api, onNotify } from '../api';
import { ProcessStatus } from '../types';
import type { ProcessBody } from '../api';

export function useProcessRunner() {
  const jobIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ProcessStatus | null>(null);
  const [running, setRunning] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const currentJobId = jobIdRef.current;
      if (!currentJobId) return;
      const s = await api.getStatus(currentJobId);
      setStatus(s);
      setRunning(s.running);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const unsub = onNotify((method, params) => {
      if (!params || typeof params !== 'object' || Array.isArray(params)) return;
      const p = params as Record<string, unknown>;
      const safeKeys = new Set(['running', 'progress', 'current_file', 'ok_count', 'err_count', 'logs']);
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) {
        if (safeKeys.has(k)) filtered[k] = v;
      }
      const currentJobId = jobIdRef.current;
      if (currentJobId) {
        if (method === `job.${currentJobId}.progress`) {
          setStatus((prev) => prev ? { ...prev, ...filtered } as ProcessStatus : null);
        } else if (method === `job.${currentJobId}.complete`) {
          setStatus((prev) => prev ? { ...prev, running: false, progress: 100, ...filtered } as ProcessStatus : null);
          setRunning(false);
        }
      }
    });
    return unsub;
  }, []);

  const startProcess = useCallback(async (body: ProcessBody) => {
    const id = body.job_id || crypto.randomUUID();
    jobIdRef.current = id;
    await api.startProcess({ ...body, job_id: id });
    setRunning(true);
    pollStatus();
  }, [pollStatus]);

  const cancelProcess = useCallback(async () => {
    const currentJobId = jobIdRef.current;
    if (currentJobId) {
      try {
        await api.cancelProcess(currentJobId);
      } catch { /* ignore */ }
    }
    pollStatus();
  }, [pollStatus]);

  return { status, running, pollStatus, startProcess, cancelProcess };
}
