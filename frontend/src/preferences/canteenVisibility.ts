export function canShowCanteen(canteenId: string, priceTier: string): boolean {
  return priceTier !== 'student' || canteenId !== 'dozentenfoyer';
}
