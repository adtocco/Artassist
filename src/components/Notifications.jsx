import { createContext, useContext, useState, useCallback, useRef } from 'react';
import './Notifications.css';

const NotificationContext = createContext(null);

let nextId = 1;

/**
 * Notification types: 'success' | 'error' | 'info' | 'progress'
 * A 'progress' notification stays until explicitly dismissed or updated.
 */
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const notify = useCallback(({ type = 'info', title, message, duration = 5000 }) => {
    const id = nextId++;
    const notification = { id, type, title, message, createdAt: Date.now() };

    setNotifications(prev => [...prev, notification]);

    // Auto-dismiss (except progress type)
    if (type !== 'progress' && duration > 0) {
      timersRef.current[id] = setTimeout(() => dismiss(id), duration);
    }

    return id;
  }, [dismiss]);

  const update = useCallback((id, updates) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    // If updating to a final type, auto-dismiss after a while
    if (updates.type && updates.type !== 'progress') {
      if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => dismiss(id), updates.duration || 6000);
    }
  }, [dismiss]);

  return (
    <NotificationContext.Provider value={{ notify, dismiss, update }}>
      {children}
      <div className="notifications-container">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`notification notification-${n.type}`}
            onClick={() => n.type !== 'progress' && dismiss(n.id)}
          >
            <div className="notification-icon">
              {n.type === 'success' && '✅'}
              {n.type === 'error' && '❌'}
              {n.type === 'info' && 'ℹ️'}
              {n.type === 'progress' && (
                <span className="notification-spinner" />
              )}
            </div>
            <div className="notification-content">
              {n.title && <strong className="notification-title">{n.title}</strong>}
              {n.message && <span className="notification-message">{n.message}</span>}
            </div>
            <button
              className="notification-close"
              onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
