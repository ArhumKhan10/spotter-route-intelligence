import { useEffect, useId, useRef, useState } from 'react'
import { CircleNotch, MapPin, X } from '@phosphor-icons/react'
import { api } from '../types'
import type { Location } from '../types'

export default function CityInput({
  label,
  value,
  onChange,
  kind,
}: {
  label: string
  value: Location | null
  onChange: (v: Location | null) => void
  kind: 'origin' | 'destination'
}) {
  const [query, setQuery] = useState(value?.name || '')
  const [results, setResults] = useState<Location[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [active, setActive] = useState(-1)
  const wrapper = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (value) setQuery(value.name)
  }, [value])
  useEffect(() => {
    if (!open || query.length < 2 || query === value?.name) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setMessage('')
      setActive(-1)
      try {
        const data = await api<{ results: Location[] }>(
          `/api/geocode/?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
        setResults(data.results)
        if (!data.results.length) setMessage('No cities found. Try a nearby city.')
      } catch (e) {
        if (!controller.signal.aborted)
          setMessage(e instanceof Error ? e.message : 'City search is unavailable.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open, value?.name])
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const choose = (location: Location) => {
    onChange(location)
    setQuery(location.name)
    setOpen(false)
    setResults([])
  }
  return (
    <div className="city-field" ref={wrapper}>
      <label htmlFor={id}>{label}</label>
      <div className={`city-input ${open ? 'focused' : ''}`}>
        <span className={`place-symbol ${kind}`}>
          {kind === 'origin' ? <span /> : <MapPin size={17} weight="fill" />}
        </span>
        <input
          id={id}
          value={query}
          autoComplete="off"
          placeholder={kind === 'origin' ? 'Where are you starting?' : 'Where are you headed?'}
          role="combobox"
          aria-expanded={open && (results.length > 0 || !!message)}
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(null)
            setResults([])
            setMessage('')
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            }
            if (e.key === 'Enter' && open && active >= 0 && results[active]) {
              e.preventDefault()
              choose(results[active])
            }
          }}
        />
        {loading ? (
          <CircleNotch className="spin" size={17} />
        ) : (
          query && (
            <button
              type="button"
              className="clear-input"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                onChange(null)
                setQuery('')
                setResults([])
              }}
            >
              <X size={13} />
            </button>
          )
        )}
      </div>
      {open && query.length >= 2 && query !== value?.name && (results.length > 0 || message) && (
        <div
          className="city-results"
          id={`${id}-results`}
          role="listbox"
          aria-label={`${label} cities`}
        >
          {results.map((location, i) => (
            <button
              type="button"
              role="option"
              id={`${id}-${i}`}
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              key={`${location.lat}-${location.lon}`}
              onClick={() => choose(location)}
            >
              <MapPin size={17} />
              <span>{location.name}</span>
            </button>
          ))}
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </div>
  )
}
