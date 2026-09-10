"use client";

export function ClientCard({ title, onSelect }: { title: string; onSelect?: () => void }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {onSelect && <button onClick={onSelect}>Action</button>}
    </div>
  );
}
