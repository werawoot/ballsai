'use client'

import type { ChangeEvent } from 'react'

// The sort picker inside the search form: choosing an order submits the form, so the list
// reloads in that order. Without JavaScript the search button submits it the same way.
export default function SortSelect({ id, label, value, options }: { id: string; label: string; value: string; options: Array<{ value: string; label: string }> }) {
  const submit = (event: ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit()
  return <label className="tn-sort" htmlFor={id}>
    <span>{label}</span>
    <select id={id} name="sort" defaultValue={value} onChange={submit}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
}
