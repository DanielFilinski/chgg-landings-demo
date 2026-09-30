(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Типографика: предлоги и союзы не остаются висеть в конце строки ---------- */
  function typograf(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const shortWord = /(^|[\s(«„"—–-])([А-ЯЁа-яёA-Za-z]{1,2})\s+/g;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let t = node.nodeValue;
      if (!t.trim()) continue;
      // Дважды — чтобы склеились цепочки коротких слов («и в», «а я»)
      t = t.replace(shortWord, '$1$2 ').replace(shortWord, '$1$2 ');
      t = t.replace(/\s+—/g, ' —');
      node.nodeValue = t;
    }
  }
  typograf(document.body);

  /* ---------- Раунд 1: голос из-за ширмы и субтитры ---------- */
  const voice = $('.voice');
  const wave = $('.wave');
  for (let i = 0; i < 28; i++) {
    const bar = document.createElement('i');
    // Детерминированный «шум», чтобы волна выглядела одинаково при каждой загрузке
    const h = 0.25 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 0.75;
    bar.style.setProperty('--h', h.toFixed(2));
    bar.style.animationDelay = `${-(i * 0.13) % 1}s`;
    wave.appendChild(bar);
  }

  $$('[data-take-btn]').forEach(btn => btn.addEventListener('click', () => {
    voice.dataset.take = btn.dataset.takeBtn;
    $$('[data-take-btn]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    updateCaptions();
  }));

  const caps = $$('.cap');
  function updateCaptions() {
    const vh = window.innerHeight;
    const rect = voice.getBoundingClientRect();
    voice.classList.toggle('is-speaking', rect.top < vh * 0.6 && rect.bottom > vh * 0.4);

    // Звучит строка, ближайшая к линии чуть выше середины экрана
    const line = vh * 0.45;
    let best = null;
    let bestDist = Infinity;
    for (const cap of caps) {
      if (!cap.offsetParent) continue;
      const r = cap.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - line);
      if (dist < bestDist) { bestDist = dist; best = cap; }
    }
    caps.forEach(c => c.classList.toggle('is-on', c === best && bestDist < vh * 0.5));
  }

  /* ---------- Раунд 2: вопросы Академика ---------- */
  function openQuestion(q) {
    q.classList.add('is-open');
    const btn = $('.q__btn', q);
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  $$('.q').forEach(q => {
    const btn = $('.q__btn', q);
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => openQuestion(q));
  });

  // Минута на обсуждение, как в шоу. Время вышло — ответ открывается сам
  const timed = $('.q[data-timer]');
  if (timed) {
    const total = Number(timed.dataset.timer);
    const val = $('[data-timer-val]', timed);
    const ring = $('.timer__run', timed);
    const length = 2 * Math.PI * 17;
    let left = total;
    let tick = null;
    const stop = () => { clearInterval(tick); tick = null; };
    new IntersectionObserver(([e]) => {
      if (timed.classList.contains('is-open')) return stop();
      if (e.isIntersecting && !tick) {
        tick = setInterval(() => {
          if (timed.classList.contains('is-open')) return stop();
          left -= 1;
          val.textContent = left;
          ring.style.strokeDashoffset = String(length * (1 - left / total));
          if (left <= 0) {
            stop();
            $('.q__label', timed).textContent = 'Время! Правильный ответ';
            openQuestion(timed);
          }
        }, 1000);
      } else if (!e.isIntersecting) {
        stop();
      }
    }, { threshold: 0.35 }).observe(timed);
  }

  /* ---------- Раунд 3: переписка с Гариком ---------- */
  const chat = $('.chat');
  const msgs = $$('.msg', chat);
  const queue = [];
  let busy = false;

  function reveal(msg) {
    msg.classList.remove('is-wait', 'is-typing');
    msg.classList.add('is-in');
  }
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    const msg = queue.shift();
    // Если читатель пролистал вперёд и накопилась очередь, догоняем без «печатает…»,
    // иначе он смотрит на пустой телефон
    const backlog = queue.length > 1;
    if (!backlog) msg.classList.add('is-typing');
    // Длинные сообщения «печатаются» дольше, но не настолько, чтобы надоесть
    const ms = backlog ? 90 : Math.min(300 + msg.textContent.length * 4, 900);
    setTimeout(() => { reveal(msg); busy = false; pump(); }, ms);
  }

  if (!reduceMotion && 'IntersectionObserver' in window) {
    msgs.forEach(m => m.classList.add('is-wait'));
    const io = new IntersectionObserver(entries => {
      entries
        .filter(e => e.isIntersecting)
        .map(e => e.target)
        .sort((a, b) => msgs.indexOf(a) - msgs.indexOf(b))
        .forEach(m => {
          io.unobserve(m);
          // Всё, что выше, приходит раньше — порядок переписки не ломается
          msgs.slice(0, msgs.indexOf(m) + 1).forEach(prev => {
            if (!prev.classList.contains('is-wait') || queue.includes(prev)) return;
            io.unobserve(prev);
            // Уже пролистанное выше экрана показываем сразу — анимировать его некому
            if (prev.getBoundingClientRect().bottom < 0) reveal(prev);
            else queue.push(prev);
          });
        });
      pump();
    }, { rootMargin: '0px 0px -12% 0px' });
    msgs.forEach(m => io.observe(m));
  }

  function time() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function bubble(html, out) {
    const li = document.createElement('li');
    li.className = `msg is-in${out ? ' msg--out' : ''}`;
    li.innerHTML = `${html}<time>${time()}</time>`;
    chat.appendChild(li);
    return li;
  }

  const replies = $('.replies');
  $$('[data-reply]', replies).forEach(btn => btn.addEventListener('click', () => {
    if (replies.classList.contains('is-used')) return;
    replies.classList.add('is-used');
    queue.splice(0).forEach(reveal);
    msgs.forEach(m => m.classList.contains('is-wait') && reveal(m));

    const p = document.createElement('p');
    p.textContent = btn.dataset.reply;
    bubble(p.outerHTML, true);
    if ('star' in btn.dataset) $('[data-star-box]').checked = true;

    setTimeout(() => {
      const text = 'star' in btn.dataset
        ? 'Отметил в бланке. Теперь главное — не проспать'
        : 'Тогда не тяните. Бланк внизу';
      const reply = bubble(`<p>${text}</p><a href="#hod">Перейти к бланку ↓</a>`);
      typograf(reply);
    }, reduceMotion ? 0 : 900);
  }));

  /* ---------- Табло: каждый пройденный раунд — очко знатокам ---------- */
  const rounds = $$('[data-round]');
  const scoreEl = $('[data-score]');
  const navLinks = $$('[data-nav]');
  const done = new Set();
  const toast = $('.toast');
  let toastShown = false;

  function updateScore() {
    const vh = window.innerHeight;
    let current = null;
    for (const r of rounds) {
      const rect = r.getBoundingClientRect();
      if (rect.top < vh * 0.55) {
        current = r.dataset.round;
        if (!done.has(current)) {
          done.add(current);
          scoreEl.textContent = done.size;
          scoreEl.classList.remove('is-bump');
          void scoreEl.offsetWidth; // перезапуск анимации
          scoreEl.classList.add('is-bump');
        }
      }
    }
    navLinks.forEach(a => {
      a.classList.toggle('is-done', done.has(a.dataset.nav));
      a.classList.toggle('is-current', a.dataset.nav === current);
    });

    // У бланка тост уже не нужен и только закрывает кнопку
    const atBlank = $('#hod').getBoundingClientRect().top < vh * 0.8;
    if (atBlank) toast.hidden = true;
    if (done.size === rounds.length && !toastShown && !atBlank) {
      toastShown = true;
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 7000);
    }
  }
  toast.querySelector('a').addEventListener('click', () => { toast.hidden = true; });

  /* ---------- Бланк ---------- */
  $('#blank').addEventListener('submit', e => {
    e.preventDefault();
    $('.blank__status').hidden = false;
  });

  /* ---------- Прокрутка ---------- */
  let frame = 0;
  function onScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updateCaptions();
      updateScore();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
