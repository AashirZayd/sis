"use client";

export function ClientCard(props: {
  title?: string;
  count?: number;
  user?: { name: string };
  onClick?: () => void;
  onAction?: (data: unknown) => Promise<void>;
  db?: unknown;
  token?: string;
}) {
  return <div>{props.title}</div>;
}
