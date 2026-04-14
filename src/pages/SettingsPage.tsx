import { useEffect, useState } from 'react'
import { SectionCard } from '@/components/SectionCard'
import { fetchSettings, updateSetting, type SettingRecord } from '@/lib/api'

interface SettingField {
  key: string
  label: string
  description: string
  type: 'toggle' | 'text' | 'email' | 'number'
  group: 'Outreach' | 'Notifications' | 'Compliance' | 'Captcha'
}

interface FieldState {
  value: string
  saving: boolean
  feedback: string | null
  error: string | null
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: 'OUTREACH_AUTO_SEND_ENABLED',
    label: 'Auto-send outreach',
    description: 'Laat de scheduler goedgekeurde outreach automatisch versturen.',
    type: 'toggle',
    group: 'Outreach',
  },
  {
    key: 'OUTREACH_DAILY_LIMIT',
    label: 'Dagelijkse limiet',
    description: 'Maximaal aantal outreach-e-mails dat de scheduler per dag mag versturen.',
    type: 'number',
    group: 'Outreach',
  },
  {
    key: 'ADMIN_NOTIFY_EMAIL',
    label: 'Admin notificatie e-mail',
    description: 'Ontvangt meldingen voor nieuwe inquiries en operationele signalen.',
    type: 'email',
    group: 'Notifications',
  },
  {
    key: 'EMAIL_FROM_ADDRESS',
    label: 'From-adres',
    description: 'Afzenderadres voor outreach en transactieberichten.',
    type: 'email',
    group: 'Notifications',
  },
  {
    key: 'TEST_EMAIL_OVERRIDE',
    label: 'Test e-mail override',
    description: 'Optioneel vangnet om uitgaande mail tijdelijk naar een testadres om te leiden.',
    type: 'email',
    group: 'Notifications',
  },
  {
    key: 'TURNSTILE_SITE_KEY',
    label: 'Turnstile site key',
    description: 'Publieke sleutel voor de CAPTCHA-widget op de domeinpagina.',
    type: 'text',
    group: 'Captcha',
  },
  {
    key: 'TURNSTILE_SECRET_KEY',
    label: 'Turnstile secret key',
    description: 'Server-side secret voor validatie van CAPTCHA-tokens.',
    type: 'text',
    group: 'Captcha',
  },
  {
    key: 'GDPR_SUPPRESS_UNSUBSCRIBED',
    label: 'Suppress unsubscribed',
    description: 'Blokkeer auto-send voor leads die als do-not-contact zijn gemarkeerd.',
    type: 'toggle',
    group: 'Compliance',
  },
]

function initialFieldValue(field: SettingField, record?: SettingRecord) {
  if (record) {
    return record.value
  }

  if (field.type === 'toggle') {
    return 'false'
  }

  return ''
}

function groupedFields() {
  return SETTING_FIELDS.reduce<Record<SettingField['group'], SettingField[]>>(
    (groups, field) => {
      groups[field.group].push(field)
      return groups
    },
    {
      Outreach: [],
      Notifications: [],
      Compliance: [],
      Captcha: [],
    },
  )
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingRecord[] | null>(null)
  const [fieldState, setFieldState] = useState<Record<string, FieldState>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetchSettings()
      .then((response) => {
        if (!active) {
          return
        }

        setSettings(response.items)

        const nextState: Record<string, FieldState> = {}
        for (const field of SETTING_FIELDS) {
          const existing = response.items.find((item) => item.key === field.key)
          nextState[field.key] = {
            value: initialFieldValue(field, existing),
            saving: false,
            feedback: null,
            error: null,
          }
        }
        setFieldState(nextState)
      })
      .catch((loadError: Error) => {
        if (active) {
          setError(loadError.message)
        }
      })

    return () => {
      active = false
    }
  }, [])

  function setValue(key: string, value: string) {
    setFieldState((current) => ({
      ...current,
      [key]: {
        ...current[key],
        value,
        feedback: null,
        error: null,
      },
    }))
  }

  async function handleSave(field: SettingField) {
    const state = fieldState[field.key]

    if (!state) {
      return
    }

    setFieldState((current) => ({
      ...current,
      [field.key]: {
        ...current[field.key],
        saving: true,
        feedback: null,
        error: null,
      },
    }))

    try {
      const response = await updateSetting(field.key, state.value)
      setSettings((current) => {
        const next = current ? [...current] : []
        const index = next.findIndex((item) => item.key === response.item.key)

        if (index >= 0) {
          next[index] = response.item
        } else {
          next.push(response.item)
        }

        return next
      })
      setFieldState((current) => ({
        ...current,
        [field.key]: {
          ...current[field.key],
          saving: false,
          feedback: 'Opgeslagen.',
          error: null,
        },
      }))
    } catch (saveError) {
      setFieldState((current) => ({
        ...current,
        [field.key]: {
          ...current[field.key],
          saving: false,
          feedback: null,
          error: saveError instanceof Error ? saveError.message : 'Opslaan mislukt.',
        },
      }))
    }
  }

  if (error) {
    return (
      <SectionCard title="Settings" subtitle="Kon de instellingen niet laden.">
        <p className="text-sm text-rose-700">{error}</p>
      </SectionCard>
    )
  }

  if (!settings) {
    return (
      <SectionCard title="Settings" subtitle="Instellingen laden...">
        <p className="text-sm text-slate-600">Even geduld, we halen de huidige configuratie op.</p>
      </SectionCard>
    )
  }

  const groups = groupedFields()

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([groupName, fields]) => (
        <SectionCard
          key={groupName}
          title={groupName}
          subtitle={`Beheer ${groupName.toLowerCase()}-instellingen voor deze omgeving.`}
        >
          <div className="space-y-5">
            {fields.map((field) => {
              const state = fieldState[field.key]
              const configured = settings.some((item) => item.key === field.key)

              if (!state) {
                return null
              }

              return (
                <div
                  key={field.key}
                  className="grid gap-3 border-b border-slate-200 pb-5 last:border-b-0 last:pb-0 lg:grid-cols-[1.2fr_1fr_auto]"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{field.label}</h3>
                    <p className="mt-1 text-sm text-slate-600">{field.description}</p>
                    {!configured ? (
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-amber-700">
                        Nog niet geconfigureerd
                      </p>
                    ) : null}
                  </div>

                  <div>
                    {field.type === 'toggle' ? (
                      <button
                        className={`inline-flex rounded-md px-4 py-3 text-sm font-medium ${
                          state.value === 'true'
                            ? 'bg-emerald-900 text-white'
                            : 'border border-slate-300 bg-white text-slate-700'
                        }`}
                        type="button"
                        onClick={() =>
                          setValue(field.key, state.value === 'true' ? 'false' : 'true')
                        }
                      >
                        {state.value === 'true' ? 'Ingeschakeld' : 'Uitgeschakeld'}
                      </button>
                    ) : (
                      <input
                        className="w-full rounded-md border border-slate-300 px-4 py-3"
                        type={field.type === 'number' ? 'number' : field.type}
                        value={state.value}
                        onChange={(event) => setValue(field.key, event.target.value)}
                      />
                    )}
                    {state.error ? (
                      <p className="mt-2 text-sm text-rose-700">{state.error}</p>
                    ) : state.feedback ? (
                      <p className="mt-2 text-sm text-emerald-700">{state.feedback}</p>
                    ) : null}
                  </div>

                  <div className="flex items-start">
                    <button
                      className="rounded-md bg-emerald-900 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                      disabled={state.saving}
                      type="button"
                      onClick={() => handleSave(field)}
                    >
                      {state.saving ? 'Opslaan...' : 'Opslaan'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      ))}
    </div>
  )
}
