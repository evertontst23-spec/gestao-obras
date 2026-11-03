'use client';
/** Caixa "marcar todos" para os checkboxes de mesmo nome dentro do mesmo formulário. */
export function MarcarTodos({ nome, rotulo = 'Marcar todos' }: { nome: string; rotulo?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-concreto-700">
      <input type="checkbox" className="h-5 w-5 accent-sinal-500"
        onChange={(e) => e.currentTarget.form?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${nome}"]`).forEach((c) => { c.checked = e.currentTarget.checked; })} />
      {rotulo}
    </label>
  );
}
