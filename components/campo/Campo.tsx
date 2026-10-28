'use client';
import FotoEvidencia, { type ContextoArchivo } from './FotoEvidencia';
import FirmaPad from './FirmaPad';

const SOLO_DIGITOS = ['documento', 'digitos', 'telefono'];

export default function Campo({ def, valor, onChange, error, alerta, alertaConfirmada, onConfirmarAlerta, requerido, ctx, textoDatos, deshabilitado }: {
  def: any; valor: any; onChange: (v: any) => void; error?: string; alerta?: string; alertaConfirmada?: boolean;
  onConfirmarAlerta?: (ok: boolean) => void; requerido: boolean; ctx: ContextoArchivo; textoDatos?: string; deshabilitado?: boolean;
}) {
  const id = `c_${def.id}`;
  if (def.tipo === 'aviso') {
    return (
      <div className={`rounded-lg p-3 text-sm ${def.nivel === 'alerta' ? 'border border-sol bg-sol-claro text-sol-oscuro' : 'bg-marca-claro text-marca-oscuro'}`}>
        {def.etiqueta}
      </div>
    );
  }
  if (def.tipo === 'aviso_texto_datos') {
    return (
      <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm" open>
        <summary className="cursor-pointer font-bold">{def.etiqueta}</summary>
        <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-slate-700">
          {textoDatos || 'El coordinador aún no ha cargado el texto oficial de tratamiento de datos en Configuración.'}
        </div>
      </details>
    );
  }

  let control: React.ReactNode = null;
  if (def.tipo === 'sino') {
    control = (
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={id}>
        {['SI', 'NO'].map((op) => (
          <button key={op} type="button" role="radio" aria-checked={valor === op} disabled={deshabilitado}
            onClick={() => onChange(op)}
            className={`min-h-[52px] rounded-lg border-2 text-lg font-bold ${valor === op ? 'border-marca bg-marca text-white' : 'border-slate-300 bg-white'}`}>
            {op === 'SI' ? 'Sí' : 'No'}
          </button>
        ))}
      </div>
    );
  } else if (def.tipo === 'lista' && def.opciones.length <= 5) {
    control = (
      <div className="grid gap-2" role="radiogroup" aria-labelledby={id}>
        {def.opciones.map((op: string) => (
          <button key={op} type="button" role="radio" aria-checked={valor === op} disabled={deshabilitado} onClick={() => onChange(op)}
            className={`min-h-[48px] rounded-lg border-2 px-3 text-left font-bold ${valor === op ? 'border-marca bg-marca-claro text-marca-oscuro' : 'border-slate-300 bg-white'}`}>
            {op}
          </button>
        ))}
      </div>
    );
  } else if (def.tipo === 'lista') {
    control = (
      <select id={id} className="campo-input" value={valor ?? ''} disabled={deshabilitado} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Seleccione…</option>
        {def.opciones.map((op: string) => <option key={op} value={op}>{op}</option>)}
      </select>
    );
  } else if (def.tipo === 'multi') {
    const sel: string[] = Array.isArray(valor) ? valor : [];
    control = (
      <div className="grid gap-2">
        {def.opciones.map((op: string) => {
          const on = sel.includes(op);
          return (
            <label key={op} className={`flex min-h-[48px] items-center gap-3 rounded-lg border-2 px-3 font-bold ${on ? 'border-marca bg-marca-claro' : 'border-slate-300 bg-white'}`}>
              <input type="checkbox" className="h-5 w-5" checked={on} disabled={deshabilitado}
                onChange={() => onChange(on ? sel.filter((x) => x !== op) : [...sel, op])} />
              {op}
            </label>
          );
        })}
      </div>
    );
  } else if (def.tipo === 'check') {
    control = (
      <label className="flex min-h-[48px] items-center gap-3 rounded-lg border-2 border-slate-300 bg-white px-3">
        <input type="checkbox" className="h-6 w-6" checked={valor === true} disabled={deshabilitado} onChange={(e) => onChange(e.target.checked ? true : null)} />
        <span className="font-bold">Sí</span>
      </label>
    );
  } else if (def.tipo === 'entero') {
    control = (
      <input id={id} className="campo-input" inputMode="numeric" pattern="[0-9]*" disabled={deshabilitado}
        value={valor ?? ''} onChange={(e) => {
          const d = e.target.value.replace(/\D/g, '').slice(0, 12);
          onChange(d === '' ? null : parseInt(d, 10));
        }} />
    );
  } else if (def.tipo === 'fecha') {
    control = <input id={id} type="date" className="campo-input" value={valor ?? ''} disabled={deshabilitado} onChange={(e) => onChange(e.target.value || null)} />;
  } else if (def.tipo === 'texto') {
    const digitos = SOLO_DIGITOS.includes(def.validar);
    const extra = def.validar === 'correo' ? 'No tiene' : def.validar === 'matricula' ? 'NO TIENE' : null;
    control = (
      <div className="space-y-2">
        {def.largo ? (
          <textarea id={id} className="campo-input min-h-[96px] py-2" value={valor ?? ''} maxLength={2000} disabled={deshabilitado}
            onChange={(e) => onChange(e.target.value || null)} />
        ) : (
          <input id={id} className="campo-input" value={valor ?? ''} maxLength={300} disabled={deshabilitado}
            inputMode={digitos ? 'numeric' : def.validar === 'correo' ? 'email' : 'text'}
            autoCapitalize={def.validar === 'nombre' ? 'words' : def.validar === 'correo' ? 'none' : 'sentences'}
            autoComplete="off"
            onChange={(e) => {
              let v = e.target.value;
              if (digitos) v = v.replace(/\D/g, '');
              if (def.validar === 'correo') v = v.trim();
              if (def.validar === 'matricula') v = v.toUpperCase().replace(/\s/g, '');
              onChange(v === '' ? null : v);
            }}
            onBlur={(e) => { if (def.validar === 'nombre' && e.target.value) onChange(e.target.value.trim().replace(/\s+/g, ' ')); }} />
        )}
        {extra && !deshabilitado && (
          <button type="button" className="text-sm font-bold text-marca underline" onClick={() => onChange(extra)}>{extra}</button>
        )}
      </div>
    );
  } else if (def.tipo === 'foto' || def.tipo === 'documento') {
    control = <FotoEvidencia campo={def.id} valor={valor} onChange={onChange} ctx={ctx} aceptaPdf={def.tipo === 'documento'} deshabilitado={deshabilitado} />;
  } else if (def.tipo === 'firma') {
    control = <FirmaPad campo={def.id} valor={valor} onChange={onChange} ctx={ctx} deshabilitado={deshabilitado} />;
  }

  return (
    <div className="space-y-2" id={`campo-${def.id}`}>
      <div className="flex items-start justify-between gap-2">
        <label id={id} htmlFor={id} className="text-base font-bold leading-snug">{def.etiqueta}</label>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${requerido ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
          {requerido ? 'Obligatorio' : 'Opcional'}
        </span>
      </div>
      {def.ayuda && <p className="text-sm text-slate-600">{def.ayuda}</p>}
      {control}
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {alerta && (
        <div className="rounded-lg border border-sol bg-sol-claro p-3 text-sm text-sol-oscuro">
          <p>{alerta}</p>
          <label className="mt-2 flex items-center gap-2 font-bold">
            <input type="checkbox" className="h-5 w-5" checked={!!alertaConfirmada} disabled={deshabilitado} onChange={(e) => onConfirmarAlerta?.(e.target.checked)} />
            Verifiqué el dato y es correcto
          </label>
        </div>
      )}
    </div>
  );
}
