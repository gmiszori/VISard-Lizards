import { jsPDF } from 'jspdf';

export interface Recipe {
  title: string;
  intro: string;
  servings: number;
  minutes: number;
  ingredients: Array<{ amount: string; item: string }>;
  steps: string[];
}

type Language = 'en' | 'de';
type Color = [number, number, number];

const GREEN: Color = [23, 102, 79];
const INK: Color = [22, 43, 36];
const MUTED: Color = [88, 108, 99];
const LINE: Color = [211, 226, 216];
const PALE: Color = [239, 246, 241];
const PAGE_WIDTH = 210;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 264;

export function createRecipePdf(recipe: Recipe, language: Language, logo?: Uint8Array): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const copy = language === 'de'
    ? { eyebrow: 'ZU HAUSE NACHKOCHEN', recipe: 'REZEPT', servings: 'PORTIONEN', time: 'ZEIT', minutes: 'Minuten', ingredients: 'Zutaten', method: 'Zubereitung', note: 'KI-inspirierte Nachkochidee, kein Originalrezept. Zutaten und Allergene selbst prüfen.', page: 'Seite' }
    : { eyebrow: 'RECREATE AT HOME', recipe: 'RECIPE', servings: 'SERVINGS', time: 'TIME', minutes: 'minutes', ingredients: 'Ingredients', method: 'Method', note: 'AI-inspired recreation, not the official recipe. Check ingredients and allergens yourself.', page: 'Page' };
  let y = 47;

  const color = (rgb: Color): void => { doc.setTextColor(...rgb); };
  const fill = (rgb: Color): void => { doc.setFillColor(...rgb); };
  const stroke = (rgb: Color): void => { doc.setDrawColor(...rgb); };

  function header(): void {
    if (logo) {
      doc.addImage(logo, 'PNG', MARGIN, 15, 14, 14);
    } else {
      fill(GREEN);
      doc.roundedRect(MARGIN, 15, 14, 14, 3.5, 3.5, 'F');
      color([255, 255, 255]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(23);
      doc.text('U', MARGIN + 7, 26, { align: 'center' });
    }
    color(INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('UniEats', MARGIN + 19, 25.2);
    color(MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(copy.recipe, PAGE_WIDTH - MARGIN, 24.3, { align: 'right' });
    stroke(LINE);
    doc.setLineWidth(0.35);
    doc.line(MARGIN, 35, PAGE_WIDTH - MARGIN, 35);
  }

  function newPage(continuedSection?: string): void {
    doc.addPage();
    header();
    y = 48;
    if (continuedSection) {
      color(GREEN);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${continuedSection} ${language === 'de' ? '(Fortsetzung)' : '(continued)'}`, MARGIN, y);
      y += 12;
    }
  }

  function ensureSpace(height: number, continuedSection?: string): void {
    if (y + height > CONTENT_BOTTOM) newPage(continuedSection);
  }

  function paragraph(text: string, size: number, lineHeight: number, after: number, bold = false, textColor: Color = INK): void {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    color(textColor);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      color(textColor);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
    y += after;
  }

  function section(title: string): void {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    color(INK);
    doc.text(title, MARGIN, y);
    stroke(LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y + 4, PAGE_WIDTH - MARGIN, y + 4);
    y += 13;
  }

  header();
  doc.setProperties({ title: `${recipe.title} | UniEats`, subject: 'AI-inspired home recipe', creator: 'UniEats' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  color(GREEN);
  doc.text(copy.eyebrow, MARGIN, y);
  y += 11;
  if (recipe.title === 'SURPRISE DESSERT ✨') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(23);
    color(INK);
    const title = 'SURPRISE DESSERT';
    doc.text(title, MARGIN, y);
    const x = MARGIN + doc.getTextWidth(title) + 5;
    const sparkle = (centerX: number, centerY: number, radius: number): void => {
      const inner = radius * 0.22;
      fill(GREEN);
      doc.lines([
        [inner, radius - inner], [radius - inner, inner], [inner - radius, inner], [-inner, radius - inner],
        [-inner, inner - radius], [inner - radius, -inner], [radius - inner, -inner], [inner, inner - radius],
      ], centerX, centerY - radius, [1, 1], 'F', true);
    };
    sparkle(x, y - 3, 3.6);
    sparkle(x + 5.5, y - 6, 1.7);
    y += 13;
  } else {
    paragraph(recipe.title, 23, 10, 3, true);
  }
  paragraph(recipe.intro, 10.5, 5.5, 7, false, MUTED);

  ensureSpace(22);
  fill(PALE);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 19, 2, 2, 'F');
  stroke(LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + CONTENT_WIDTH / 2, y + 4, MARGIN + CONTENT_WIDTH / 2, y + 15);
  for (const [x, label, value] of [
    [MARGIN + 9, copy.servings, String(recipe.servings)],
    [MARGIN + CONTENT_WIDTH / 2 + 9, copy.time, `${recipe.minutes} ${copy.minutes}`],
  ] as Array<[number, string, string]>) {
    color(MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(label, x, y + 6.5);
    color(INK);
    doc.setFontSize(12);
    doc.text(value, x, y + 14.5);
  }
  y += 31;

  section(copy.ingredients);
  for (const ingredient of recipe.ingredients) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const amountLines = doc.splitTextToSize(ingredient.amount, 29) as string[];
    doc.setFont('helvetica', 'normal');
    const itemLines = doc.splitTextToSize(ingredient.item, CONTENT_WIDTH - 48) as string[];
    const rowHeight = Math.max(amountLines.length, itemLines.length) * 5.2 + 3;
    ensureSpace(rowHeight, copy.ingredients);
    fill(GREEN);
    doc.circle(MARGIN + 1.5, y - 1.2, 0.85, 'F');
    color(GREEN);
    doc.setFont('helvetica', 'bold');
    amountLines.forEach((line, index) => doc.text(line, MARGIN + 7, y + index * 5.2));
    color(INK);
    doc.setFont('helvetica', 'normal');
    itemLines.forEach((line, index) => doc.text(line, MARGIN + 47, y + index * 5.2));
    y += rowHeight;
  }

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const openingStepsHeight = recipe.steps.slice(0, 2).reduce((height, step) =>
    height + (doc.splitTextToSize(step, CONTENT_WIDTH - 17) as string[]).length * 5.4 + 6, 13);
  if (openingStepsHeight <= CONTENT_BOTTOM - 48) ensureSpace(openingStepsHeight);
  section(copy.method);
  recipe.steps.forEach((step, index) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(step, CONTENT_WIDTH - 17) as string[];
    const stepHeight = lines.length * 5.4 + 6;
    if (stepHeight <= CONTENT_BOTTOM - 60) ensureSpace(stepHeight, copy.method);
    let firstLine = true;
    for (const line of lines) {
      ensureSpace(5.4, copy.method);
      if (firstLine) {
        fill(GREEN);
        doc.roundedRect(MARGIN, y - 4, 9, 9, 2, 2, 'F');
        color([255, 255, 255]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(String(index + 1), MARGIN + 4.5, y + 1.9, { align: 'center' });
        firstLine = false;
      }
      color(INK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.text(line, MARGIN + 16, y);
      y += 5.4;
    }
    y += 6;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    stroke(LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 273, PAGE_WIDTH - MARGIN, 273);
    color(MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(copy.note, CONTENT_WIDTH - 38) as string[];
    noteLines.forEach((line, index) => doc.text(line, MARGIN, 280 + index * 4));
    doc.text(`${copy.page} ${page} / ${pages}`, PAGE_WIDTH - MARGIN, 280, { align: 'right' });
  }
  return doc;
}

export async function downloadRecipePdf(recipe: Recipe, language: Language): Promise<void> {
  let logo: Uint8Array | undefined;
  try {
    const response = await fetch('/icon-192.png');
    if (response.ok) logo = new Uint8Array(await response.arrayBuffer());
  } catch { /* The vector brand mark still works offline. */ }
  const slug = recipe.title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'recipe';
  createRecipePdf(recipe, language, logo).save(`${slug}-recipe.pdf`);
}
