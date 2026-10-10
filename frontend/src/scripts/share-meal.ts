import { dishUrl, mealIdFromHash, shareText } from '../meals/share';

const words = {
  en: { label: 'Share this dish', copied: 'Link copied. Paste it in your chat.', failed: 'Could not share. Copy the address from the browser instead.' },
  de: { label: 'Gericht teilen', copied: 'Link kopiert. Füge ihn in deinen Chat ein.', failed: 'Teilen nicht möglich. Kopiere stattdessen die Adresse aus dem Browser.' },
};
const lang = () => (document.documentElement.lang === 'de' ? 'de' : 'en');
let status: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function say(message: string) {
  if (!status) {
    status = document.createElement('p');
    status.className = 'share-status';
    status.setAttribute('role', 'status');
    document.body.append(status);
  }
  status.textContent = message;
  status.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { if (status) status.hidden = true; }, 3500);
}

function describe(article: HTMLElement) {
  const dish = article.querySelector('h3')?.textContent ?? '';
  const amount = article.querySelector('[data-price-amount]')?.textContent ?? '';
  const mensa = document.querySelector('h1')?.textContent ?? '';
  const when = article.querySelector('.meal-service-time')?.textContent?.replace(/\s+/g, ' ') ?? '';
  const url = new URL(dishUrl(location.pathname, article.id), location.origin).toString();
  return { dish, price: /\d/.test(amount) ? amount.trim() : '', mensa, when, url };
}

document.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-share-meal]');
  const article = button?.closest<HTMLElement>('[data-meal-row]');
  if (!button || !article) return;
  const input = describe(article);
  try {
    if (navigator.share) {
      await navigator.share({ title: input.dish, text: shareText(input), url: input.url });
    } else {
      await navigator.clipboard.writeText(`${shareText(input)}\n${input.url}`);
      say(words[lang()].copied);
    }
  } catch (error) {
    // Closing the share sheet is not an error.
    if ((error as DOMException)?.name !== 'AbortError') say(words[lang()].failed);
  }
});

function syncLabels() {
  document.querySelectorAll<HTMLButtonElement>('[data-share-meal]').forEach(b => { b.setAttribute('aria-label', words[lang()].label); b.title = words[lang()].label; });
}
document.addEventListener('languagechange', syncLabels);
syncLabels();

// A shared link opens the page at the dish and highlights it (styles: .menu-item.is-linked).
const linked = mealIdFromHash(location.hash);
const target = linked ? document.getElementById(linked) : null;
if (target?.matches('[data-meal-row]')) {
  target.classList.add('is-linked');
  requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
}
