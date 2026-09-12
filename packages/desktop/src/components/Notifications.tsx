import { useAppStore } from '../state/appStore';

/** Barra fina com borda lateral colorida por severidade — não card cheio flutuante (lição já aprendida no redesign WPF). */
export function Notifications() {
  const notifications = useAppStore((s) => s.notifications);
  const dismiss = useAppStore((s) => s.dismissNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="mkd-notifications">
      {notifications.map((n) => (
        <div key={n.id} className="mkd-notification" data-severity={n.severity} onClick={() => dismiss(n.id)}>
          {n.message}
        </div>
      ))}
    </div>
  );
}
