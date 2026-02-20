import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useNotifications } from './Notifications';
import './Notifications.css';

const AnalysisQueueContext = createContext(null);

let taskId = 1;

/**
 * Task shape:
 * { id, type, title, status: 'pending'|'running'|'done'|'error', result, error, onComplete }
 *
 * type: 'photo' | 'collection' | 'series' | 'wall'
 */
export function AnalysisQueueProvider({ children, lang = 'fr' }) {
  const [tasks, setTasks] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [lastDoneTimestamp, setLastDoneTimestamp] = useState(0);
  const runningRef = useRef(false);
  const queueRef = useRef([]);
  const { notify, update: updateNotification } = useNotifications();

  // Process the queue sequentially (one analysis at a time to avoid overloading the server)
  const processQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    while (queueRef.current.length > 0) {
      const task = queueRef.current[0];

      // Mark as running
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'running' } : t));

      const notifId = notify({
        type: 'progress',
        title: task.title,
        message: lang === 'fr' ? 'Analyse en cours…' : 'Analysis in progress…',
      });

      try {
        const result = await task.execute();

        // Call the completion callback (DB save) BEFORE marking as fully done
        if (task.onComplete) {
          try {
            await task.onComplete(result);
          } catch (e) {
            console.error('onComplete error:', e);
            notify({
              type: 'error',
              title: task.title,
              message: lang === 'fr' ? 'Erreur lors de la sauvegarde en base' : 'Error saving to database',
              duration: 8000,
            });
          }
        }

        // Mark as done & signal completion to all listeners
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done', result } : t));
        setLastDoneTimestamp(Date.now());

        updateNotification(notifId, {
          type: 'success',
          title: task.title,
          message: lang === 'fr' ? 'Analyse terminée !' : 'Analysis complete!',
          duration: 6000,
        });
      } catch (err) {
        console.error('Analysis task failed:', err);

        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error', error: err.message } : t));

        updateNotification(notifId, {
          type: 'error',
          title: task.title,
          message: err.message || (lang === 'fr' ? 'Échec de l\'analyse' : 'Analysis failed'),
          duration: 8000,
        });

        if (task.onError) {
          try { await task.onError(err); } catch (e) { console.error('onError error:', e); }
        }
      }

      // Remove from internal queue
      queueRef.current = queueRef.current.filter(t => t.id !== task.id);
    }

    runningRef.current = false;
  }, [notify, updateNotification, lang]);

  /**
   * Enqueue an analysis task.
   * @param {Object} opts
   * @param {string} opts.type - 'photo'|'collection'|'series'|'wall'
   * @param {string} opts.title - Display title
   * @param {Function} opts.execute - Async function that runs the analysis and returns the result
   * @param {Function} opts.onComplete - Callback with result
   * @param {Function} opts.onError - Callback on error
   * @returns {number} task id
   */
  const enqueue = useCallback((opts) => {
    const id = taskId++;
    const task = {
      id,
      type: opts.type || 'photo',
      title: opts.title || (lang === 'fr' ? 'Analyse' : 'Analysis'),
      status: 'pending',
      result: null,
      error: null,
      execute: opts.execute,
      onComplete: opts.onComplete,
      onError: opts.onError,
    };

    setTasks(prev => [...prev, task]);
    queueRef.current.push(task);

    notify({
      type: 'info',
      title: task.title,
      message: lang === 'fr' ? 'Ajouté à la file d\'attente' : 'Added to the queue',
      duration: 3000,
    });

    // Start processing if not already running
    processQueue();

    return id;
  }, [lang, notify, processQueue]);

  /**
   * Enqueue multiple photo analyses that run concurrently (batch).
   * Returns a Promise that resolves to an array of {result?, error?}
   */
  const enqueueBatch = useCallback((opts) => {
    const id = taskId++;
    const task = {
      id,
      type: opts.type || 'photo',
      title: opts.title || (lang === 'fr' ? 'Analyse par lot' : 'Batch Analysis'),
      status: 'pending',
      result: null,
      error: null,
      execute: opts.execute,
      onComplete: opts.onComplete,
      onError: opts.onError,
    };

    setTasks(prev => [...prev, task]);
    queueRef.current.push(task);

    processQueue();
    return id;
  }, [lang, processQueue]);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'pending' || t.status === 'running'));
  }, []);

  const pendingCount = tasks.filter(t => t.status === 'pending' || t.status === 'running').length;
  const hasActiveTasks = pendingCount > 0;

  return (
    <AnalysisQueueContext.Provider value={{ enqueue, enqueueBatch, tasks, hasActiveTasks, clearCompleted, lastDoneTimestamp }}>
      {children}

      {/* Floating Action Button — visible when there are tasks */}
      {tasks.length > 0 && (
        <button
          className="analysis-queue-fab"
          onClick={() => setPanelOpen(p => !p)}
          title={lang === 'fr' ? 'File d\'analyses' : 'Analysis queue'}
          style={!hasActiveTasks ? { animation: 'none' } : undefined}
        >
          {hasActiveTasks ? '⏳' : '✅'}
          {pendingCount > 0 && <span className="queue-badge">{pendingCount}</span>}
        </button>
      )}

      {/* Panel */}
      {panelOpen && tasks.length > 0 && (
        <div className="analysis-queue-panel">
          <div className="analysis-queue-header">
            <span>{lang === 'fr' ? 'File d\'analyses' : 'Analysis Queue'} ({tasks.length})</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {tasks.some(t => t.status === 'done' || t.status === 'error') && (
                <button onClick={clearCompleted} title={lang === 'fr' ? 'Nettoyer' : 'Clear'}>🗑</button>
              )}
              <button onClick={() => setPanelOpen(false)}>×</button>
            </div>
          </div>
          <div className="analysis-queue-list">
            {tasks.length === 0 ? (
              <div className="queue-empty">{lang === 'fr' ? 'Aucune analyse' : 'No analyses'}</div>
            ) : (
              [...tasks].reverse().map(t => (
                <div key={t.id} className="queue-item">
                  <span className="queue-item-icon">
                    {t.type === 'photo' && '📷'}
                    {t.type === 'collection' && '📁'}
                    {t.type === 'series' && '🎞'}
                    {t.type === 'wall' && '🖼'}
                  </span>
                  <div className="queue-item-info">
                    <div className="queue-item-title">{t.title}</div>
                    <div className={`queue-item-status ${t.status === 'running' ? 'running' : t.status === 'done' ? 'done' : t.status === 'error' ? 'error' : ''}`}>
                      {t.status === 'pending' && (lang === 'fr' ? 'En attente…' : 'Pending…')}
                      {t.status === 'running' && (lang === 'fr' ? 'En cours…' : 'Running…')}
                      {t.status === 'done' && (lang === 'fr' ? 'Terminé' : 'Done')}
                      {t.status === 'error' && (t.error || (lang === 'fr' ? 'Échec' : 'Failed'))}
                    </div>
                  </div>
                  {t.status === 'running' && <span className="queue-item-spinner" />}
                  {t.status === 'done' && <span style={{ color: '#4caf50' }}>✓</span>}
                  {t.status === 'error' && <span style={{ color: '#f44336' }}>✗</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </AnalysisQueueContext.Provider>
  );
}

export function useAnalysisQueue() {
  const ctx = useContext(AnalysisQueueContext);
  if (!ctx) throw new Error('useAnalysisQueue must be used within AnalysisQueueProvider');
  return ctx;
}
