'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (value: number) => String(value).padStart(2, '0');
export function AnnouncementDatePicker({ label, value, min, onChange, today, allowToday = false }: { label: string; value: string; min: string; onChange: (value: string) => void; today: string; allowToday?: boolean }) {
  const selectedDay = value.slice(0, 10);
  const minimumDay = min.slice(0, 10);
  const [month, setMonth] = useState(() => (selectedDay && selectedDay >= minimumDay ? selectedDay : minimumDay).slice(0, 7));
  const first = new Date(`${month}-01T00:00:00Z`);
  const year = first.getUTCFullYear(); const monthIndex = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${pad(index + 1)}`)];
  const previous = new Date(Date.UTC(year, monthIndex - 1, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString().slice(0, 7);
  const selectDay = (day: string) => {
    let time = value.slice(11, 16) || '09:00';
    if (`${day}T${time}` < min) time = min.slice(11, 16);
    onChange(`${day}T${time}`);
  };
  const time = value.slice(11, 16);
  const times = Array.from({ length: 96 }, (_, index) => `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`);
  if (time && !times.includes(time)) times.push(time);
  times.sort();
  return <div className="min-w-0 rounded-xl border border-white/10 bg-zinc-950 p-3">
    <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-zinc-200">{label}</span>{allowToday ? <button type="button" disabled={today < minimumDay} onClick={() => { setMonth(today.slice(0,7)); selectDay(today); }} className="rounded px-2 py-1 text-[10px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-30">Today</button> : <span className="text-[10px] text-zinc-500">Tomorrow or later</span>}</div>
    <div className="flex items-center justify-between"><button type="button" aria-label={`Previous month for ${label}`} disabled={previous < minimumDay.slice(0,7)} onClick={() => setMonth(previous)} className="rounded p-1.5 text-zinc-400 transition hover:bg-white/10 disabled:opacity-20"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="text-xs font-semibold">{first.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })}</span><button type="button" aria-label={`Next month for ${label}`} onClick={() => setMonth(next)} className="rounded p-1.5 text-zinc-400 transition hover:bg-white/10"><ChevronRight className="h-3.5 w-3.5" /></button></div>
    <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">{DAYS.map((day) => <span key={day} className="py-1 text-[9px] font-semibold text-zinc-600">{day}</span>)}{cells.map((day, index) => day ? <button key={day} type="button" aria-label={`${label}: ${day}`} aria-pressed={selectedDay === day} disabled={day < minimumDay} onClick={() => selectDay(day)} className={`flex aspect-square min-h-7 items-center justify-center rounded-md text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:text-zinc-700 ${selectedDay === day ? 'bg-red-600 font-bold text-white' : day === today ? 'bg-white/5 text-red-400 hover:bg-white/10' : 'text-zinc-300 hover:bg-white/10'}`}>{Number(day.slice(8))}</button> : <span key={`empty-${index}`} />)}</div>
    <label className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] font-medium text-zinc-400">Time · PHT<select value={time} disabled={!selectedDay} onChange={(event) => onChange(`${selectedDay}T${event.target.value}`)} className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-2 focus:ring-white/20"><option value="" disabled>Select time</option>{times.map((item) => <option key={item} value={item} disabled={`${selectedDay}T${item}` < min}>{item}</option>)}</select></label>
    <p className="mt-2 min-h-4 text-[10px] text-zinc-500">{value ? `${selectedDay} at ${time}` : 'Choose a date'}</p>
  </div>;
}
