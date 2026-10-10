import { jsPDF } from 'jspdf';

export interface Recipe {
  title: string;
  intro: string;
  servings: number;
  minutes: number;
  ingredients: Array<{ amount: string; item: string }>;
  steps: string[];
}

export function createRecipePdf(recipe: Recipe, language: 'en' | 'de'): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = 23;

  function write(text: string, size = 11, bold = false, gap = 5): void {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width - margin * 2) as string[];
    const lineHeight = size * 0.44;
    if (y + lines.length * lineHeight > height - margin) { doc.addPage(); y = margin; }
    doc.text(lines, margin, y);
    y += lines.length * lineHeight + gap;
  }

  doc.setDrawColor(25, 99, 76);
  doc.setLineWidth(1.2);
  doc.line(margin, 15, width - margin, 15);
  write(recipe.title, 20, true, 8);
  write(recipe.intro, 11, false, 7);
  write(language === 'de' ? `${recipe.servings} Portionen  |  ${recipe.minutes} Minuten` :
    `${recipe.servings} servings  |  ${recipe.minutes} minutes`, 10, true, 11);
  write(language === 'de' ? 'Zutaten' : 'Ingredients', 15, true, 5);
  recipe.ingredients.forEach(ingredient => write(`- ${ingredient.amount} ${ingredient.item}`, 10, false, 2));
  y += 7;
  write(language === 'de' ? 'Zubereitung' : 'Method', 15, true, 5);
  recipe.steps.forEach((step, index) => write(`${index + 1}. ${step}`, 10, false, 5));
  y += 6;
  write(language === 'de'
    ? 'KI-inspirierte Nachkochidee, kein Originalrezept. Zutaten und Allergene selbst prüfen.'
    : 'AI-inspired recreation, not the official recipe. Check ingredients and allergens yourself.', 9);
  return doc;
}

export function downloadRecipePdf(recipe: Recipe, language: 'en' | 'de'): void {
  const slug = recipe.title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'recipe';
  createRecipePdf(recipe, language).save(`${slug}-recipe.pdf`);
}
