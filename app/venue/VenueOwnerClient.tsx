'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Building2, CalendarPlus, CalendarX2, Check, CircleDollarSign, Clock3, MapPin, Plus, X } from 'lucide-react'
import { resolveCourtId, resolveVenueId } from '@/lib/venue-owner-form'
import { ownerManageableSlots } from '@/lib/venue-slot-status'
import { provinceName } from '@/lib/thai-provinces'
import type { Locale } from '@/i18n/config'
import VenuePhotoManager from './VenuePhotoManager'
import type { OwnerPhotoRow } from '@/lib/venue-photo-manager'

export type VenueSlot = { id: string; starts_at: string; ends_at: string; price_baht: number; status: 'open' | 'blocked' | 'reserved' }
export type VenueCourt = { id: string; name: string; sport: 'football' | 'futsal'; surface: string; capacity: number | null; venue_slots: VenueSlot[] | null }
export type OwnerVenue = { id: string; name: string; province: string; address: string; contact_phone: string; description: string; amenities: string[]; venue_courts: VenueCourt[] | null }
export type OwnerBooking = {
  id: string; status: 'pending' | 'confirmed' | 'declined' | 'cancelled'; purpose: string; note: string; requested_at: string
  venue_slots: { starts_at: string; ends_at: string; price_baht: number; venue_courts: { name: string; venue_profiles: { name: string } | null } | null } | null
}

const fieldStyle = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #d9dde2', borderRadius: 9, minHeight: 42, padding: '9px 11px', font: '600 14px var(--font-sarabun)', color: '#172033', background: '#fff' }
const labelStyle = { display: 'block', color: '#546070', font: '800 10px var(--font-oswald)', letterSpacing: 1.1, margin: '0 0 6px' }
// Worded by venueOwner.bookingStatus.<status>.
const statusStyle: Record<OwnerBooking['status'], { background: string; color: string }> = {
  pending: { background: '#fff3c7', color: '#925d00' },
  confirmed: { background: '#dcfce7', color: '#166534' },
  declined: { background: '#fee2e2', color: '#b91c1c' },
  cancelled: { background: '#e5e7eb', color: '#4b5563' },
}

export type OwnerVenuePhoto = OwnerPhotoRow & { venue_id: string }

export default function VenueOwnerClient({ venues, bookings, photos }: { venues: OwnerVenue[]; bookings: OwnerBooking[]; photos: OwnerVenuePhoto[] }) {
  const router = useRouter()
  const t = useTranslations('venueOwner')
  const sportName = useTranslations('venues.sport')
  const locale = useLocale() as Locale
  const format = useFormatter()
  // The time zone comes from the provider (Asia/Bangkok), so the owner and the booker read
  // the same clock whatever device they use.
  const dateTime = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' })
  const time = (value: string) => format.dateTime(new Date(value), { timeStyle: 'short' })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [showCreate, setShowCreate] = useState(venues.length === 0)
  const [venueForm, setVenueForm] = useState({ name: '', province: '', address: '', contactPhone: '', description: '', amenities: '' })
  const [courtForm, setCourtForm] = useState({ venueId: venues[0]?.id ?? '', name: '', sport: 'football' as 'football' | 'futsal', surface: '', capacity: '' })
  const [slotForm, setSlotForm] = useState({ courtId: venues[0]?.venue_courts?.[0]?.id ?? '', startsAt: '', endsAt: '', priceBaht: '' })

  const succeed = (text: string) => setFeedback({ tone: 'success', text })

  const request = async (path: string, method: string, body?: unknown) => {
    setBusy(true); setFeedback(null)
    const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const data = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setBusy(false)
    if (!response || !response.ok) {
      setFeedback({ tone: 'error', text: data?.error ?? t('feedback.failed') })
      return false
    }
    router.refresh(); return true
  }

  const createVenue = async () => {
    const ok = await request('/api/venues', 'POST', { ...venueForm, amenities: venueForm.amenities.split(',').map(item => item.trim()).filter(Boolean) })
    if (ok) { setShowCreate(false); succeed(t('feedback.venueCreated')) }
  }
  const createCourt = async () => {
    const venueId = resolveVenueId(courtForm.venueId, venues)
    if (!venueId) return
    const ok = await request(`/api/venues/${venueId}/courts`, 'POST', { ...courtForm, venueId, capacity: courtForm.capacity ? Number(courtForm.capacity) : null })
    if (ok) { setCourtForm(value => ({ ...value, name: '', surface: '', capacity: '' })); succeed(t('feedback.courtAdded')) }
  }
  const createSlot = async () => {
    const courtId = resolveCourtId(slotForm.courtId, courts)
    if (!courtId) return
    const ok = await request('/api/venue-slots', 'POST', { ...slotForm, courtId, priceBaht: Number(slotForm.priceBaht) })
    if (ok) { setSlotForm(value => ({ ...value, startsAt: '', endsAt: '', priceBaht: '' })); succeed(t('feedback.slotOpened')) }
  }
  const respond = async (bookingId: string, status: 'confirmed' | 'declined') => {
    const ok = await request(`/api/venue-bookings/${bookingId}`, 'PATCH', { status })
    if (ok) succeed(status === 'confirmed' ? t('feedback.bookingConfirmed') : t('feedback.bookingDeclined'))
  }
  const closeSlot = async (slotId: string) => {
    if (!window.confirm(t('feedback.confirmCloseSlot'))) return
    const ok = await request(`/api/venue-slots/${slotId}`, 'DELETE')
    if (ok) succeed(t('feedback.slotClosed'))
  }

  const courts = venues.flatMap(venue => (venue.venue_courts ?? []).map(court => ({ ...court, venueName: venue.name })))
  const liveSlots = ownerManageableSlots(courts)
  const input = (label: string, value: string, onChange: (value: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label><span style={labelStyle}>{label}</span><input {...props} value={value} onChange={event => onChange(event.target.value)} style={fieldStyle} /></label>

  return <div style={{ display: 'grid', gap: 16 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '11px 13px', borderRadius: 10, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534', fontSize: 13, fontWeight: 700 }}>{feedback.text}</p>}

    <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
      <div style={{ background: '#101827', color: 'white', borderRadius: 14, padding: 16 }}><Building2 size={18} color="#f5c518" /><b style={{ display: 'block', font: '800 28px var(--font-oswald)', marginTop: 7 }}>{venues.length}</b><span style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>{t('stats.myVenues')}</span></div>
      <div style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 16 }}><Clock3 size={18} color="#CC0001" /><b style={{ display: 'block', font: '800 28px var(--font-oswald)', marginTop: 7 }}>{bookings.filter(item => item.status === 'pending').length}</b><span style={{ fontSize: 12, color: '#667085' }}>{t('stats.pending')}</span></div>
      <div style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 16 }}><Check size={18} color="#16803d" /><b style={{ display: 'block', font: '800 28px var(--font-oswald)', marginTop: 7 }}>{bookings.filter(item => item.status === 'confirmed').length}</b><span style={{ fontSize: 12, color: '#667085' }}>{t('stats.confirmed')}</span></div>
    </section>

    {showCreate && <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderTop: '4px solid #CC0001', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}><Building2 size={20} color="#CC0001" /><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>VENUE SETUP</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>{t('create.title')}</h2></div></div>
      <div style={{ display: 'grid', gap: 11, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        {input(t('create.name'), venueForm.name, value => setVenueForm({ ...venueForm, name: value }), { placeholder: t('create.namePlaceholder') })}
        {input(t('create.province'), venueForm.province, value => setVenueForm({ ...venueForm, province: value }), { placeholder: t('create.provincePlaceholder') })}
        {input(t('create.contact'), venueForm.contactPhone, value => setVenueForm({ ...venueForm, contactPhone: value }), { placeholder: t('create.contactPlaceholder') })}
        {input(t('create.address'), venueForm.address, value => setVenueForm({ ...venueForm, address: value }), { placeholder: t('create.addressPlaceholder') })}
      </div>
      <label style={{ display: 'block', marginTop: 11 }}><span style={labelStyle}>{t('create.amenities')}</span><input value={venueForm.amenities} onChange={event => setVenueForm({ ...venueForm, amenities: event.target.value })} placeholder={t('create.amenitiesPlaceholder')} style={fieldStyle} /></label>
      <label style={{ display: 'block', marginTop: 11 }}><span style={labelStyle}>{t('create.description')}</span><textarea value={venueForm.description} onChange={event => setVenueForm({ ...venueForm, description: event.target.value })} rows={3} placeholder={t('create.descriptionPlaceholder')} style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }} /></label>
      <button type="button" disabled={busy} onClick={createVenue} style={{ marginTop: 15, width: '100%', border: 0, borderRadius: 9, padding: 12, background: '#CC0001', color: 'white', fontWeight: 900, cursor: 'pointer' }}>{busy ? t('create.saving') : t('create.submit')}</button>
    </section>}

    {venues.length > 0 && <>
      <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 13 }}><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>MY VENUES</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>{t('myVenues.title')}</h2></div><button type="button" onClick={() => setShowCreate(true)} style={{ border: '1px solid #d9dde2', background: '#fff', padding: '8px 10px', borderRadius: 8, fontWeight: 800, color: '#172033', cursor: 'pointer' }}><Plus size={15} /> {t('myVenues.add')}</button></div>
        <div style={{ display: 'grid', gap: 10 }}>{venues.map(venue => <article key={venue.id} style={{ background: '#f7f7f5', borderRadius: 11, overflow: 'hidden' }}><div style={{ padding: 13 }}><b>{venue.name}</b><p style={{ color: '#697586', fontSize: 12, margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {provinceName(venue.province, locale)} · {venue.address}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(venue.venue_courts ?? []).length ? venue.venue_courts?.map(court => <span key={court.id} style={{ background: 'white', border: '1px solid #e0e4e8', padding: '4px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{court.name} · {sportName(court.sport)}</span>) : <span style={{ color: '#a16207', fontSize: 12 }}>{t('myVenues.noCourts')}</span>}</div><div style={{ marginTop: 13, paddingTop: 12, borderTop: '1px solid #e0e4e8' }}><VenuePhotoManager venueId={venue.id} venueName={venue.name} photos={photos.filter(photo => photo.venue_id === venue.id)} /></div></div></article>)}</div>
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <form onSubmit={event => { event.preventDefault(); void createCourt() }} style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}><Plus size={19} color="#CC0001" /><h2 style={{ margin: 0, fontSize: 19 }}>{t('court.title')}</h2></div><div style={{ display: 'grid', gap: 10 }}><label><span style={labelStyle}>{t('court.venue')}</span><select value={resolveVenueId(courtForm.venueId, venues)} onChange={event => setCourtForm({ ...courtForm, venueId: event.target.value })} style={fieldStyle}>{venues.map(venue => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label>{input(t('court.name'), courtForm.name, value => setCourtForm({ ...courtForm, name: value }), { placeholder: t('court.namePlaceholder') })}<label><span style={labelStyle}>{t('court.sport')}</span><select value={courtForm.sport} onChange={event => setCourtForm({ ...courtForm, sport: event.target.value as 'football' | 'futsal' })} style={fieldStyle}><option value="football">{sportName('football')}</option><option value="futsal">{sportName('futsal')}</option></select></label>{input(t('court.surface'), courtForm.surface, value => setCourtForm({ ...courtForm, surface: value }), { placeholder: t('court.surfacePlaceholder') })}{input(t('court.capacity'), courtForm.capacity, value => setCourtForm({ ...courtForm, capacity: value }), { type: 'number', min: 1 })}</div><button disabled={busy} style={{ width: '100%', border: 0, borderRadius: 9, padding: 11, background: '#172033', color: 'white', fontWeight: 900, marginTop: 14 }}>{t('court.submit')}</button></form>
        <form onSubmit={event => { event.preventDefault(); void createSlot() }} style={{ background: '#101827', color: 'white', borderRadius: 14, padding: 18 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}><CalendarPlus size={19} color="#f5c518" /><h2 style={{ margin: 0, fontSize: 19 }}>{t('slot.title')}</h2></div>{courts.length === 0 ? <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: 1.5 }}>{t('slot.needCourt')}</p> : <div style={{ display: 'grid', gap: 10 }}><label><span style={{ ...labelStyle, color: 'rgba(255,255,255,.7)' }}>{t('slot.court')}</span><select value={resolveCourtId(slotForm.courtId, courts)} onChange={event => setSlotForm({ ...slotForm, courtId: event.target.value })} style={fieldStyle}>{courts.map(court => <option value={court.id} key={court.id}>{court.venueName} · {court.name}</option>)}</select></label>{input(t('slot.start'), slotForm.startsAt, value => setSlotForm({ ...slotForm, startsAt: value }), { type: 'datetime-local' })}{input(t('slot.end'), slotForm.endsAt, value => setSlotForm({ ...slotForm, endsAt: value }), { type: 'datetime-local' })}{input(t('slot.price'), slotForm.priceBaht, value => setSlotForm({ ...slotForm, priceBaht: value }), { type: 'number', min: 0, placeholder: t('slot.pricePlaceholder') })}<button disabled={busy} style={{ width: '100%', border: 0, borderRadius: 9, padding: 11, background: '#f5c518', color: '#101827', fontWeight: 900, marginTop: 4 }}>{t('slot.submit')}</button></div>}</form>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}><Clock3 size={19} color="#CC0001" /><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>OPEN SLOTS</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>{t('openSlots.title')}</h2></div></div>
        {liveSlots.length === 0 ? <p style={{ color: '#788290', fontSize: 13, margin: 0 }}>{t('openSlots.empty')}</p> : <div style={{ display: 'grid', gap: 9 }}>{liveSlots.map(slot => <article key={slot.id} style={{ border: '1px solid #e4e7eb', borderRadius: 11, padding: 13, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div style={{ minWidth: 0, flex: '1 1 210px' }}><b>{slot.venueName} · {slot.courtName}</b><p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>{dateTime(slot.starts_at)} – {time(slot.ends_at)} · ฿{format.number(slot.price_baht)}</p><span style={{ display: 'inline-block', marginTop: 7, borderRadius: 20, padding: '3px 9px', fontSize: 10, fontWeight: 900, background: slot.canClose ? '#ecfdf5' : '#fff7ed', color: slot.canClose ? '#166534' : '#9a3412' }}>{t(`openSlots.status.${slot.status}`)}</span></div>{slot.canClose ? <button type="button" disabled={busy} onClick={() => void closeSlot(slot.id)} aria-label={t('openSlots.closeLabel', { venue: slot.venueName, court: slot.courtName })} style={{ border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', padding: '8px 10px', fontWeight: 900, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarX2 size={15} /> {t('openSlots.close')}</button> : <span style={{ color: '#9a3412', fontSize: 11, fontWeight: 700, maxWidth: 190 }}>{t('openSlots.cannotClose')}</span>}</article>)}</div>}
      </section>
    </>}

    <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}><CircleDollarSign size={19} color="#CC0001" /><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>BOOKING INBOX</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>{t('inbox.title')}</h2></div></div>{bookings.length === 0 ? <p style={{ color: '#788290', fontSize: 13, margin: 0 }}>{t('inbox.empty')}</p> : <div style={{ display: 'grid', gap: 10 }}>{bookings.map(booking => { const info = booking.venue_slots; const style = statusStyle[booking.status]; return <article key={booking.id} style={{ border: '1px solid #e4e7eb', borderRadius: 11, padding: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><b>{info?.venue_courts?.venue_profiles?.name ?? t('inbox.venueFallback')}</b><p style={{ margin: '3px 0', color: '#667085', fontSize: 12 }}>{info?.venue_courts?.name ?? t('inbox.courtFallback')} · {info ? dateTime(info.starts_at) : ''}</p><p style={{ margin: 0, fontSize: 13 }}>{booking.purpose}</p></div><span style={{ background: style.background, color: style.color, height: 'fit-content', borderRadius: 20, padding: '4px 8px', fontSize: 10, fontWeight: 900 }}>{t(`bookingStatus.${booking.status}`)}</span></div>{booking.note && <p style={{ color: '#667085', fontSize: 12, margin: '8px 0 0' }}>{booking.note}</p>}{booking.status === 'pending' && <div style={{ display: 'flex', gap: 8, marginTop: 11 }}><button disabled={busy} onClick={() => void respond(booking.id, 'confirmed')} style={{ flex: 1, border: 0, borderRadius: 8, background: '#15803d', color: 'white', padding: 9, fontWeight: 900 }}><Check size={14} /> {t('inbox.confirm')}</button><button disabled={busy} onClick={() => void respond(booking.id, 'declined')} style={{ flex: 1, border: '1px solid #fecaca', borderRadius: 8, background: 'white', color: '#b91c1c', padding: 9, fontWeight: 900 }}><X size={14} /> {t('inbox.decline')}</button></div>}</article> })}</div>}</section>
  </div>
}
