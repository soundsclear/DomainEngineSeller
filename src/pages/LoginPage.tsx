export function LoginPage() {
  return (
    <div className="mx-auto max-w-lg rounded-[32px] border border-white/80 bg-white p-8 shadow-sm">
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">Admin auth</p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-950">Simple MVP login</h1>
      <p className="mt-3 text-sm text-slate-600">
        Phase 1 only needs straightforward admin authentication. Replace this mock form with a real worker-backed
        session flow when wiring the API.
      </p>
      <form className="mt-6 space-y-4">
        <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="admin@example.com" />
        <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="Password" type="password" />
        <button className="rounded-full bg-emerald-900 px-5 py-3 text-sm font-medium text-white" type="button">
          Sign in
        </button>
      </form>
    </div>
  )
}
