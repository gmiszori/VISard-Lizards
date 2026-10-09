import type { Profile } from './profile.ts';

/** TODO(backend): replace this local mock with authenticated profile persistence. */
export function saveProfile(profile: Profile): void {
  localStorage.setItem('campuseats-profile', JSON.stringify(profile));
  const raw = JSON.parse(localStorage.getItem('campuseats-preferences') || '{}') as unknown;
  const existing = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  localStorage.setItem('campuseats-preferences', JSON.stringify({ ...existing,
    locations: [...new Set([profile.campus, ...profile.campusSecondary])],
    vegan: true, vegetarian: profile.diet !== 'vegan',
    // Existing preferences group fish with meat; detailed diet filtering is in the payoff.
    meat: profile.diet !== 'vegan' && profile.diet !== 'vegetarian',
  }));
  localStorage.setItem('campuseats-language', profile.lang);
  const select = document.querySelector<HTMLSelectElement>('#language-select');
  if (select) { select.value = profile.lang; select.dispatchEvent(new Event('change', { bubbles: true })); }
  console.info('CampusEats profile', JSON.stringify(profile, null, 2));
}
