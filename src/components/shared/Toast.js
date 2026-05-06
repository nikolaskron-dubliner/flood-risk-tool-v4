export default function Toast({ show, message }) {
  if (!show) return null;

  return (
    <div className="copied-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

