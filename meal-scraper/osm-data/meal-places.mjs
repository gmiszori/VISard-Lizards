export const mealPlacesQuery='[out:json][timeout:12];(nwr[amenity~"^(restaurant|cafe|fast_food)$"][name][opening_hours](47.1,8.2,47.7,8.9);nwr[shop~"^(kiosk|supermarket|convenience|bakery|deli)$"][name][opening_hours](47.1,8.2,47.7,8.9););out center;';
export function mealPlace(tags,quickMeal=false) {
  if(!tags?.name) return null;
  const grocery=['kiosk','supermarket','convenience','bakery','deli'].includes(tags.shop);
  const takeaway=tags.amenity==='fast_food' || tags.takeaway==='yes' || tags.takeaway==='only';
  const quick=grocery || takeaway || tags.amenity==='cafe';
  if(quickMeal ? !quick : !['restaurant','cafe','fast_food'].includes(tags.amenity)) return null;
  return {quickMeal:quick,venueType:grocery ? tags.shop : tags.amenity,cuisine:tags.cuisine||''};
}
