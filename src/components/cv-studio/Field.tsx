export function Field({ label, value, onChange, area = false, placeholder = '', rows = 3 }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string; rows?: number }) {
  return <label className="studio-field"><span>{label}</span>{area ?
    <textarea rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /> :
    <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}</label>;
}
