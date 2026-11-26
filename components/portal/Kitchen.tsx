'use client';
import { useEffect, useState } from 'react';
import { WEEKDAYS, isNonVegDay, nonVegDays, type Snapshot } from '../../shared/domain';
import { date } from './api';
import Icon from './Icon';
import { Badge, PageTitle, Panel, type PageProps } from './UI';

const REFRESH_MS = 15000;
const MEALS = [
  { key: 'breakfast', title: 'Breakfast', icon: 'sun' },
  { key: 'lunch', title: 'Lunch', icon: 'food' },
  { key: 'dinner', title: 'Dinner', icon: 'food' },
] as const;

/** Meal counts for one date. Residents away for the full day on an outpass are already set to "no meals". */
function countsFor(data: Snapshot, day: string) {
  const active = data.residents.filter(r => r.status === 'active');
  const forms = data.meals.filter(m => m.date === day && active.some(r => r.id === m.residentId));
  const nonVegDay = isNonVegDay(data.settings.food, day);
  const meals = MEALS.map(meal => {
    const eating = forms.filter(m => m[meal.key]);
    const nonVeg = nonVegDay && meal.key !== 'breakfast' ? eating.filter(m => m.nonVeg).length : 0;
    return { ...meal, total: eating.length, nonVeg, veg: eating.length - nonVeg };
  });
  const submitted = new Set(forms.map(m => m.residentId));
  const missing = active.filter(r => !submitted.has(r.id));
  return { day, nonVegDay, meals, submitted: forms.length, active: active.length, missing, locked: data.mealLocks.find(l => l.date === day) };
}

function DayBoard({ title, counts, live, today }: { title: string; counts: ReturnType<typeof countsFor>; live: boolean; today?: boolean }) {
  const status = counts.locked ? `Final · locked ${date(counts.locked.lockedAt, true)}` : today ? 'No final count was locked' : live ? 'Live · choices still changing' : 'Choices open at 6 PM';
  return <Panel className="jn-kitchen-day jn-panel-padded" eyebrow={title} title={date(counts.day)} action={<Badge status={counts.locked ? 'verified' : live ? 'active' : 'pending'}>{status}</Badge>}>
    <p className="jn-kitchen-diet"><Icon name="food" size={16}/>{counts.nonVegDay ? 'Non-veg day: lunch and dinner are split into veg and non-veg.' : 'Veg day.'}</p>
    <div className="jn-kitchen-grid">{counts.meals.map(m => <article key={m.key} className="jn-kitchen-meal">
      <div className="jn-kitchen-meal-head"><Icon name={m.icon} size={22}/><span>{m.title}</span></div>
      <strong aria-label={`${m.total} ${m.title} plates`}>{m.total}</strong><small>plates</small>
      {counts.nonVegDay && m.key !== 'breakfast' && <div className="jn-kitchen-split"><span><i className="veg"/>Veg <b>{m.veg}</b></span><span><i className="nonveg"/>Non-veg <b>{m.nonVeg}</b></span></div>}
    </article>)}</div>
    <div className="jn-kitchen-foot"><span><b>{counts.submitted}</b> of {counts.active} residents have chosen</span>{counts.missing.length > 0 && <span className="jn-kitchen-missing">Not chosen yet: {counts.missing.map(r => r.name).join(', ')}</span>}</div>
  </Panel>;
}

export function Kitchen({ data, refresh }: PageProps) {
  const [updated, setUpdated] = useState(() => new Date());
  // Refresh more often than the rest of the portal so the counts stay live while this page is open.
  useEffect(() => { const timer = setInterval(async () => { if (document.visibilityState === 'visible') { await refresh(); setUpdated(new Date()); } }, REFRESH_MS); return () => clearInterval(timer); }, [refresh]);
  const today = countsFor(data, data.meta.businessDate), tomorrow = countsFor(data, data.meta.tomorrow);
  const days = nonVegDays(data.settings.food).map(d => WEEKDAYS[d]);
  return <><PageTitle eyebrow="WHAT TO COOK, AT A GLANCE" title="Kitchen" text="Live meal counts from residents’ choices. This page updates on its own." action={<span className="jn-kitchen-updated"><i/>Updated {updated.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>}/>
    <div className="jn-kitchen-days"><DayBoard title="TODAY" counts={today} live={false} today/><DayBoard title="TOMORROW" counts={tomorrow} live={data.meta.mealWindowOpen}/></div>
    <p className="jn-page-footnote">Residents choose tomorrow’s meals from 6 PM to 11 PM; the count is final at 11 PM. Non-veg days: {days.length ? days.join(', ') : 'none'} (change them in Hostel settings → Food plan). Residents away on an outpass for the whole day are not counted.</p></>;
}
