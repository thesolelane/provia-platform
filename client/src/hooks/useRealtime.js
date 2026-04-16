import { useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io();

export default function useRealtime(jobId, onUpdate) {
  useEffect(() => {
    if (!jobId) return;

    socket.emit('join-job', jobId);

    const handleUpdate = (data) => {
      if (onUpdate) onUpdate(data);
    };

    socket.on(`job:${jobId}`, handleUpdate);

    return () => {
      socket.off(`job:${jobId}`, handleUpdate);
      socket.emit('leave-job', jobId);
    };
  }, [jobId, onUpdate]);
}
