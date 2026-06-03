import { useApp } from '../store/AppContext';

const icons: Record<string, string> = { success: '✓', error: '✕', info: 'ℹ' };
const colors: Record<string, string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-[#534AB7]',
};

export default function ToastContainer() {
  const { state, dispatch } = useApp();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {state.toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-white text-sm pointer-events-auto ${colors[t.type]}`}
          onClick={() => dispatch({ type: 'REMOVE_TOAST', payload: t.id })}
        >
          <span className="font-bold">{icons[t.type]}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
