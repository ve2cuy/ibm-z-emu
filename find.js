// Recherche dans la console et le journal : correspondances surlignées (API Custom
// Highlight du CSS, quand le fureteur l'a), suivante et précédente, filtre (seulement les
// lignes qui contiennent le texte : « IEF », « $HASP »…) et copie de ce qui est montré.
// La recherche ne tient pas compte de la casse.

const DEBOUNCE_MS = 250;

/**
 * `ui` : éléments de la barre (box, input, count, prev, next, filter, copy); `target()` :
 * l'élément montré par l'onglet courant (console ou journal), ou null; `copyText(text)`.
 */
export function initFind(ui, target, copyText) {
  const hl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';
  let filterOn = false;
  let ranges = [];
  let index = -1;
  let timer = 0;
  let el = null;     // élément de l'onglet (console-out, journal-out)
  let view = null;   // vue filtrée, à la place de `el`

  const query = () => ui.input.value.trim().toUpperCase();

  function showView(on) {
    if (!el) return;
    if (on && !view) {
      view = document.createElement('pre');
      view.className = `${el.className} find-view`;
      el.after(view);
    }
    if (view) view.hidden = !on;
    el.hidden = on;
  }

  /** Lignes du texte de `el` qui contiennent la recherche. */
  function filtered() {
    const q = query();
    return el.textContent.split('\n').filter((l) => l.toUpperCase().includes(q)).join('\n');
  }

  function textNodes(root) {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
    return out;
  }

  function paint() {
    if (!hl) return;
    CSS.highlights.set('find', new Highlight(...ranges));
    if (ranges[index]) CSS.highlights.set('find-cur', new Highlight(ranges[index]));
    else CSS.highlights.delete('find-cur');
  }

  function count() {
    ui.count.textContent = query() ? `${ranges.length ? index + 1 : 0}/${ranges.length}` : '';
  }

  /** Recalcule les correspondances (contenu ou recherche changés). */
  function update(keep = true) {
    const q = query();
    if (filterOn && q && el) {
      showView(true);
      const atEnd = view.scrollHeight - view.scrollTop - view.clientHeight < 40;
      view.textContent = filtered();
      if (atEnd) view.scrollTop = view.scrollHeight;
    } else {
      showView(false);
    }
    const root = filterOn && q ? view : el;
    const old = ranges.length;
    ranges = [];
    if (q && root) {
      for (const n of textNodes(root)) {
        const s = n.data.toUpperCase();
        for (let i = s.indexOf(q); i >= 0; i = s.indexOf(q, i + q.length)) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + q.length);
          ranges.push(r);
        }
      }
    }
    // Nouvelle recherche : la dernière correspondance (la plus récente).
    if (!keep || index >= ranges.length || old === 0) index = ranges.length - 1;
    paint();
    count();
  }

  function scrollTo() {
    const r = ranges[index];
    if (!r) return;
    const box = filterOn && view && !view.hidden ? view : el;
    const a = r.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    box.scrollTop += a.top - c.top - c.height / 2;
  }

  function go(step) {
    if (!ranges.length) return;
    index = (index + step + ranges.length) % ranges.length;
    paint();
    count();
    scrollTo();
  }

  ui.input.addEventListener('input', () => {
    update(false);
    scrollTo();
  });
  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      ui.input.value = '';
      update(false);
    }
  });
  ui.prev.addEventListener('click', () => go(-1));
  ui.next.addEventListener('click', () => go(1));
  ui.filter.addEventListener('click', () => {
    filterOn = !filterOn;
    ui.filter.setAttribute('aria-pressed', String(filterOn));
    ui.filter.classList.toggle('active', filterOn);
    update(false);
    scrollTo();
  });
  ui.copy.addEventListener('click', () => {
    if (!el) return;
    copyText(filterOn && query() ? filtered() : el.textContent);
  });

  return {
    /** Onglet changé : la barre suit (console et journal seulement). */
    tab() {
      const next = target();
      if (el && el !== next) {
        if (view) view.remove();
        view = null;
        if (hl) {
          CSS.highlights.delete('find');
          CSS.highlights.delete('find-cur');
        }
      }
      el = next;
      ui.box.hidden = !el;
      if (el) update(false);
    },
    /** Le contenu de l'onglet a changé (nouvelles lignes). */
    changed() {
      if (!el || !query()) return;
      clearTimeout(timer);
      timer = setTimeout(() => update(true), DEBOUNCE_MS);
    },
    focus() {
      if (!el) return false;
      ui.input.focus();
      ui.input.select();
      return true;
    },
  };
}
