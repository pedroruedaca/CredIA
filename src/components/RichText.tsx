/** Renders content-file copy where `**text**` is bold. No other markup is interpreted. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p))}</>;
}
