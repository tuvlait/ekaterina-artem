/* =====================================================================
   Свадьба Екатерины и Артёма — 27.08.2027
   Скрипт без зависимостей: отсчёт, меню, анимации,
   отправка анкет (Google Apps Script через JSONP).
   ===================================================================== */

/* ---------------------------------------------------------------------
   НАСТРОЙКИ.
   --------------------------------------------------------------------- */
var CONFIG = {
  /* Когда свадьба (для отсчёта) */
  date: '2027-08-27T15:00:00+03:00',

  /* Google Apps Script — URL веб-приложения (заканчивается на /exec) */
  scriptUrl: 'https://script.google.com/macros/s/AKfycbxCyBTTa0eZRU4_d4hN5pSCrPG1a7zJHpev8wnpB_3xi_jku1RzZh4PscocUHw6zBkNAw/exec',

  /* Formspree — если понадобится резервный канал (не обязательно) */
  formEndpoint: '',

  /* Резервный режим: если сервер не ответил, гость может прислать ответ в Telegram.
     Впиши ник (без @). Если пусто — работает системное «поделиться». */
  telegram: 'artiom_gorch'
};

/* ---------------------------------------------------------------------
   1. Обратный отсчёт
   --------------------------------------------------------------------- */
(function () {
  var box = document.getElementById('countdown');
  if (!box) return;

  var target = new Date(CONFIG.date).getTime();
  var d = box.querySelector('[data-d]');
  var h = box.querySelector('[data-h]');
  var m = box.querySelector('[data-m]');
  var s = box.querySelector('[data-s]');
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) {
      d.textContent = h.textContent = m.textContent = s.textContent = '0';
      return;
    }
    d.textContent = Math.floor(diff / 864e5);
    h.textContent = pad(Math.floor((diff % 864e5) / 36e5));
    m.textContent = pad(Math.floor((diff % 36e5) / 6e4));
    s.textContent = pad(Math.floor((diff % 6e4) / 1e3));
  }

  tick();
  setInterval(tick, 1000);
})();

/* ---------------------------------------------------------------------
   2. Появление секций при прокрутке
   --------------------------------------------------------------------- */
(function () {
  var items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('is-visible'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  Array.prototype.forEach.call(items, function (el) { io.observe(el); });
})();

/* ---------------------------------------------------------------------
   3. Меню появляется после обложки
   --------------------------------------------------------------------- */
(function () {
  var nav = document.getElementById('nav');
  var hero = document.querySelector('.hero');
  if (!nav || !hero) return;

  var toggle = function () {
    nav.classList.toggle('is-visible', window.scrollY > hero.offsetHeight * 0.7);
  };
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
})();

/* ---------------------------------------------------------------------
   4. Анкета: если гость выбрал «не приду», прячем лишние вопросы
   --------------------------------------------------------------------- */
(function () {
  var form = document.getElementById('rsvpForm');
  if (!form) return;

  var extra = form.querySelector('[data-when-attending]');
  var radios = form.querySelectorAll('input[name="attending"]');
  if (!extra || !radios.length) return;

  function sync() {
    var value = form.querySelector('input[name="attending"]:checked');
    var coming = !value || value.value.indexOf('Да') === 0;
    extra.hidden = !coming;
  }

  Array.prototype.forEach.call(radios, function (r) { r.addEventListener('change', sync); });
  sync();
})();

/* ---------------------------------------------------------------------
   5. Отправка форм
   --------------------------------------------------------------------- */
(function () {
  var LS_KEY = 'wedding:answers';

  function labelOf(form, field) {
    if (field.id) {
      var l = form.querySelector('label[for="' + field.id + '"]');
      if (l) return l.textContent.replace(/\s*\(необязательно\)\s*$/i, '').trim();
    }
    var group = field.closest ? field.closest('.field') : null;
    if (group) {
      var span = group.querySelector('.field__label');
      if (span) return span.textContent.trim();
      var lab = group.querySelector('label');
      if (lab) return lab.textContent.replace(/\s*\(необязательно\)\s*$/i, '').trim();
    }
    return field.name || '';
  }

  function buildText(form) {
    var isQuiz = form.id === 'quizForm';
    var head = isQuiz
      ? 'Ответы на тест — свадьба Екатерины и Артёма (27.08.2027)'
      : 'Анкета гостя — свадьба Екатерины и Артёма (27.08.2027)';
    var lines = [head, ''];

    var data = new FormData(form);
    var seen = {};
    data.forEach(function (value, key) {
      var field = form.elements[key];
      if (field && !field.tagName && field.length) field = field[0];
      var label = field ? labelOf(form, field) : key;
      if (!label || seen[label]) return;
      seen[label] = true;
      lines.push(label + ': ' + String(value).trim());
    });

    lines.push('', 'Отправлено: ' + new Date().toLocaleString('ru-RU'));
    return lines.join('\n');
  }

  function saveLocally(text) {
    try {
      var all = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      all.push({ at: new Date().toISOString(), text: text });
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch (e) { /* приватный режим — не страшно */ }
  }

  function showMsg(form, html, isError) {
    var msg = form.querySelector('[data-msg]');
    if (!msg) return;
    msg.className = 'form-msg' + (isError ? ' is-error' : '');
    msg.innerHTML = html;
    msg.style.display = 'block';
  }

  function clearMsg(form) {
    var msg = form.querySelector('[data-msg]');
    if (msg) { msg.style.display = 'none'; msg.innerHTML = ''; }
  }

  /* Резервный режим: показываем готовый ответ и кнопку Telegram */
  function fallback(form, text, lead) {
    var msg = form.querySelector('[data-msg]');
    if (!msg) return;

    msg.className = 'form-msg' + (lead && lead.isError ? ' is-error' : '');
    msg.innerHTML = '';
    msg.style.display = 'block';

    var box = document.createElement('div');
    box.className = 'answer-box';

    if (lead && lead.text) {
      var pre = document.createElement('p');
      pre.className = 'answer-hint';
      pre.textContent = lead.text;
      box.appendChild(pre);
    }

    var direct = !!CONFIG.telegram;
    var encoded = encodeURIComponent(text);

    var hint = document.createElement('p');
    hint.className = 'answer-hint';
    hint.textContent = direct
      ? 'Ответ готов — отправьте его нам одним нажатием:'
      : 'Ответ готов — отправьте его нам. В открывшемся окне выберите наш чат:';
    box.appendChild(hint);

    var area = document.createElement('textarea');
    area.readOnly = true;
    area.value = text;
    box.appendChild(area);

    var actions = document.createElement('div');
    actions.className = 'answer-actions';

    var tg = document.createElement('a');
    tg.className = 'btn btn--small';
    tg.target = '_blank';
    tg.rel = 'noopener';
    if (CONFIG.telegram) {
      tg.href = 'https://t.me/' + CONFIG.telegram + '?text=' + encoded;
      tg.textContent = 'В Telegram';
    } else {
      tg.href = 'https://t.me/share/url?url=' + encodeURIComponent(location.href) + '&text=' + encoded;
      tg.textContent = 'Поделиться в Telegram';
    }
    actions.appendChild(tg);

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn--small btn--ghost';
    copy.textContent = 'Скопировать';
    copy.addEventListener('click', function () {
      var done = function () {
        copy.textContent = 'Скопировано';
        setTimeout(function () { copy.textContent = 'Скопировать'; }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { area.select(); });
      } else {
        area.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
      }
    });
    actions.appendChild(copy);

    box.appendChild(actions);

    var note = document.createElement('p');
    note.className = 'answer-note';
    note.textContent = 'Откроется Telegram с готовым текстом. Нажмите там «Отправить» — иначе сообщение никуда не уйдёт.';
    box.appendChild(note);

    msg.appendChild(box);
  }

  /* Отправка в Google Apps Script через JSONP */
  function sendToScript(form, text, btn, original) {
    var payload = {};
    new FormData(form).forEach(function (value, key) {
      payload[key] = String(value);
    });
    payload.type = form.id === 'quizForm' ? 'quiz' : 'rsvp';
    payload.ts = new Date().toISOString();

    var cbName = '__weddingCb' + Date.now() + Math.floor(Math.random() * 1000);
    var script = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () { finish(new Error('timeout')); }, 20000);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }

    function finish(err, res) {
      if (finished) return;
      finished = true;
      cleanup();

      if (err) {
        fallback(form, text, {
          isError: true,
          text: 'Не получилось отправить автоматически. Пришлите ответ нам в Telegram — так мы точно его увидим.'
        });
        return;
      }

      form.reset();
      var extra = form.querySelector('[data-when-attending]');
      if (extra) extra.hidden = false;
      showMsg(form, '<p>Спасибо! Ответ у нас — он уже в нашей таблице и в Telegram 💛</p>', false);
    }

    window[cbName] = function (res) {
      if (res && res.ok) finish(null, res);
      else finish(new Error((res && res.error) || 'server error'));
    };
    script.onerror = function () { finish(new Error('network')); };

    script.src = CONFIG.scriptUrl +
      '?type=' + encodeURIComponent(payload.type) +
      '&callback=' + cbName +
      '&data=' + encodeURIComponent(JSON.stringify(payload));

    document.body.appendChild(script);

    if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
  }

  function setup(form) {
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.textContent : '';
      var text = buildText(form);

      clearMsg(form);
      saveLocally(text);

      /* 1. Google Таблица + Telegram (приоритет) */
      if (CONFIG.scriptUrl) {
        sendToScript(form, text, btn, original);
        return;
      }

      /* 2. Formspree */
      if (CONFIG.formEndpoint) {
        if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }

        fetch(CONFIG.formEndpoint, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        })
          .then(function (res) {
            if (!res.ok) throw new Error('status ' + res.status);
            form.reset();
            var extra = form.querySelector('[data-when-attending]');
            if (extra) extra.hidden = false;
            showMsg(form, '<p>Спасибо! Мы всё получили 💛</p>', false);
          })
          .catch(function () {
            fallback(form, text, {
              isError: true,
              text: 'Не получилось отправить автоматически. Скопируйте ответ и пришлите нам в Telegram — так мы точно его увидим.'
            });
          })
          .finally(function () {
            if (btn) { btn.disabled = false; btn.textContent = original; }
          });
        return;
      }

      /* 3. Ничего не подключено — отдаём готовый текст гостю */
      fallback(form, text);
    });
  }

  setup(document.getElementById('rsvpForm'));
  setup(document.getElementById('quizForm'));
})();