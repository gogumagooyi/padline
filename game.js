(() => {
  'use strict';

  const get = id => document.getElementById(id);
  const rows = 'ASDF';
  const columns = 'JKL;';
  const chordWindow = 120;
  const held = new Map();
  const controls = new Map();
  const duration = 30000;
  const lead = 130;
  const tail = 300;
  const muteKey = 'padline.mute.v1';
  const tracks = new Map([
    ['neon-skyline', {
      title: 'Neon Skyline', bpm: 120, bestKey: 'padline.best.v1',
      pitches: [261.63, 293.66, 329.63, 392, 440, 392, 329.63, 293.66],
      rhythm: [[0, 2], [0, 1.5, 3], [0, 2], [0, 1, 2, 3]],
      playStep: playNeonSkyline
    }],
    ['afterglow', {
      title: 'Afterglow', bpm: 100, bestKey: 'padline.best.afterglow.v1',
      pitches: [293.66, 349.23, 440, 523.25, 392, 349.23, 329.63, 261.63],
      rhythm: [[0, 1.5, 3], [0, 2], [0, 1, 2.5], [0, 2, 3]],
      playStep: playAfterglow
    }]
  ]);
  let track = tracks.get('neon-skyline');
  let beat = 60000 / track.bpm;
  let countIn = 3 * beat;
  const initialFeedback = get('feedback').textContent;

  function readSetting(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function writeSetting(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* Private sessions can play in memory. */ }
  }

  let best = Math.max(0, Number(readSetting(track.bestKey)) || 0);
  let muted = readSetting(muteKey) === 'true';
  let phase = 'idle';
  let startTime = 0;
  let score = 0;
  let combo = 0;
  let hits = 0;
  let attempts = 0;
  let notes = [];
  let nextNote = 0;
  let active = null;
  let audio = null;
  let master = null;
  let noise = null;
  let audioStep = 0;
  let frame = 0;
  let lastCount = 0;
  const flashes = new Map();

  function selectTrack(slug) {
    const selected = tracks.get(slug);
    if (!selected) return false;
    track = selected;
    beat = 60000 / track.bpm;
    countIn = 3 * beat;
    best = Math.max(track.sessionBest || 0, Number(readSetting(track.bestKey)) || 0);
    get('track-title').textContent = track.title;
    get('track-bpm').textContent = track.bpm + ' BPM';
    renderStats();
    return true;
  }

  const pads = Array.from({ length: rows.length * columns.length }, (_, index) => {
    const row = Math.floor(index / columns.length);
    const column = index % columns.length;
    const pad = document.createElement('div');
    pad.className = 'pad';
    pad.setAttribute('role', 'img');
    pad.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1}. Press ${rows[row]} and ${columns[column]} together.`);
    const chord = rows[row] + '+' + columns[column];
    for (const [className, text] of [['pad-key', chord], ['pad-number', `(${row + 1},${column + 1})`]]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      pad.append(span);
    }
    get('pads').append(pad);
    return pad;
  });

  function release(input) {
    const press = held.get(input);
    if (!press) return;
    held.delete(input);
    const stillHeld = [...held.values()].some(other => other.key === press.key);
    controls.get(press.key).classList.toggle('held', stillHeld);
  }

  function resetControls() {
    for (const input of held.keys()) release(input);
  }

  function press(input, key) {
    if (phase !== 'playing' || held.has(input)) return;
    held.set(input, { key, time: performance.now(), used: false });
    controls.get(key).classList.add('held');
    if (held.size !== 2) return;
    const pair = [...held.values()];
    const row = pair.find(p => rows.includes(p.key));
    const column = pair.find(p => columns.includes(p.key));
    if (!row || !column || row.used || column.used) return;
    if (Math.abs(row.time - column.time) > chordWindow) return;
    row.used = column.used = true;
    strike(rows.indexOf(row.key) * columns.length + columns.indexOf(column.key));
  }

  for (const [id, keys] of [['row-keys', rows], ['column-keys', columns]]) {
    for (const key of keys) {
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = key;
      control.setAttribute('aria-label', `${id === 'row-keys' ? 'Row' : 'Column'} ${keys.indexOf(key) + 1}, key ${key}`);
      control.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        control.setPointerCapture(event.pointerId);
        press(event.pointerId, key);
      });
      for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        control.addEventListener(eventName, event => release(event.pointerId));
      }
      controls.set(key, control);
      get(id).append(control);
    }
  }

  function renderStats() {
    get('score').textContent = String(score).padStart(6, '0');
    get('best').textContent = String(best).padStart(6, '0');
    get('combo').textContent = `${combo}×`;
    get('accuracy').textContent = attempts ? `${Math.round(100 * hits / attempts)}%` : '—';
  }

  function renderTime(elapsed) {
    const seconds = Math.floor(Math.max(0, Math.min(duration, elapsed)) / 1000);
    get('time').textContent = `0:${String(seconds).padStart(2, '0')} / 0:30`;
    get('progress').style.width = `${Math.max(0, Math.min(100, elapsed / duration * 100))}%`;
  }

  function renderSound() {
    const control = get('sound');
    control.classList.toggle('muted', muted);
    control.setAttribute('aria-pressed', String(muted));
    control.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    control.title = muted ? 'Unmute sound' : 'Mute sound';
    const label = document.getElementById('sound-label');
    if (label) label.textContent = muted ? 'Sound off' : 'Sound on';
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.45, audio.currentTime, 0.012);
  }

  function unlockAudio() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!audio) {
        audio = new Context();
        master = audio.createGain();
        master.gain.value = muted ? 0 : 0.45;
        master.connect(audio.destination);
        noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.13), audio.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch { /* The visual chart also works without Web Audio. */ }
  }

  function tone(at, frequency, length, volume, shape = 'sine', endFrequency = frequency) {
    const oscillator = audio.createOscillator();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + length);
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(envelope).connect(master);
    oscillator.start(at);
    oscillator.stop(at + length);
  }

  function percussion(at, cutoff, length, volume) {
    const source = audio.createBufferSource();
    source.buffer = noise;
    const filter = audio.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(volume, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(envelope).connect(master);
    source.start(at);
    source.stop(at + length);
  }

  function playNeonSkyline(at, step) {
    const pitches = track.pitches;
    percussion(at, 6500, 0.04, step % 2 ? 0.10 : 0.07);
    if (step % 2 === 0) tone(at, 135, 0.16, 0.8, 'sine', 43);
    if (step % 4 === 2) percussion(at, 1300, 0.105, 0.23);
    if (step % 4 === 0 || step % 8 === 5) {
      tone(at, pitches[Math.floor(step / 8) % pitches.length] / 4, 0.21, 0.32, 'triangle');
    }
    if (step % 4 === 0 || step % 8 === 6) {
      tone(at, pitches[(Math.floor(step / 2) + Math.floor(step / 8)) % pitches.length], 0.18, 0.16, 'triangle');
    }
  }

  function playAfterglow(at, step) {
    const bar = Math.floor(step / 8);
    const subdivision = step % 8;
    const root = [73.42, 58.27, 87.31, 65.41][bar % 4];
    if (subdivision === 0 || subdivision === 5) {
      tone(at, 105, 0.24, 0.66, 'sine', 42);
      tone(at, root, 0.42, 0.32, 'triangle');
    }
    if (subdivision % 2 === 1) percussion(at, 5800, 0.065, 0.08);
    if (subdivision === 4) percussion(at, 1700, 0.12, 0.27);
    const accents = track.rhythm[bar % track.rhythm.length];
    const accent = accents.indexOf(subdivision / 2);
    if (accent >= 0) {
      const pitch = track.pitches[(bar * 2 + accent) % track.pitches.length];
      tone(at, pitch, 0.34, 0.24, 'sine');
      tone(at, pitch * 3, 0.10, 0.07, 'sine');
    }
  }

  // Schedule a short distance ahead so audio stays steady between animation frames.
  function scheduleMusic(elapsed) {
    const eighth = beat / 2;
    while (audioStep * eighth < Math.min(elapsed + 100, duration)) {
      const step = audioStep++;
      const offset = step * eighth - elapsed;
      if (offset < -80 || muted || !audio || audio.state !== 'running') continue;
      const at = audio.currentTime + Math.max(0, offset / 1000);
      if (step < 0) {
        if (step % 2 === 0) tone(at, 720, 0.07, 0.14);
        continue;
      }
      track.playStep(at, step);
    }
  }

  function makeChart() {
    const chart = [];
    let lastPad = -1;
    for (let bar = 0; bar * 4 * beat < duration; bar++) {
      const rhythm = track.rhythm[bar % track.rhythm.length];
      for (const offset of rhythm) {
        const at = (bar * 4 + offset) * beat;
        if (at + tail >= duration) continue;
        const pad = (lastPad + 1 + Math.floor(Math.random() * (lastPad < 0 ? 16 : 15))) % 16;
        chart.push({ at, pad });
        lastPad = pad;
      }
    }
    return chart;
  }

  function clearActive() {
    if (active) pads[active.pad].classList.remove('lit');
    active = null;
  }

  function syncNotes(elapsed) {
    if (active && elapsed > active.at + tail) {
      clearActive();
      attempts++;
      combo = 0;
      get('feedback').textContent = 'Miss';
      renderStats();
    }
    while (nextNote < notes.length && elapsed >= notes[nextNote].at - lead) {
      const note = notes[nextNote++];
      if (elapsed > note.at + tail) {
        attempts++;
        combo = 0;
        renderStats();
      } else {
        active = note;
        pads[note.pad].classList.add('lit');
      }
    }
  }

  function strike(index) {
    if (phase !== 'playing') return;
    const elapsed = performance.now() - startTime;
    if (elapsed >= duration) return;
    syncNotes(elapsed);
    attempts++;
    if (active && active.pad === index) {
      const error = Math.abs(elapsed - active.at);
      const perfect = error <= 110;
      hits++;
      combo++;
      const points = (perfect ? 100 : 60) + Math.min(combo - 1, 20) * 5;
      score += points;
      get('feedback').textContent = `${perfect ? 'Perfect' : 'Good'} +${points}`;
      clearActive();
      const pad = pads[index];
      pad.classList.add('hit');
      clearTimeout(flashes.get(index));
      flashes.set(index, setTimeout(() => pad.classList.remove('hit'), 125));
      if (audio && audio.state === 'running' && !muted) {
        tone(audio.currentTime, track.pitches[index % track.pitches.length] * 2, 0.07, 0.12);
      }
    } else {
      combo = 0;
      get('feedback').textContent = 'Off beat';
    }
    renderStats();
  }

  function finish(complete) {
    resetControls();
    cancelAnimationFrame(frame);
    if (complete) syncNotes(duration);
    phase = 'finished';
    clearActive();
    document.body.classList.remove('playing', 'countdown');
    document.body.classList.add('finished');
    const record = complete && score > best;
    if (record) {
      best = score;
      track.sessionBest = best;
      writeSetting(track.bestKey, best);
    }
    if (complete) renderTime(duration);
    get('status').textContent = complete ? 'Round complete' : 'Stopped';
    get('feedback').textContent = complete ? (record ? 'New best score!' : `${hits} / ${notes.length} notes hit`) : 'Round stopped';
    get('start-label').textContent = 'Play again';
    renderStats();
  }

  function animate() {
    const elapsed = performance.now() - startTime;
    if (elapsed >= duration) { finish(true); return; }
    scheduleMusic(elapsed);
    if (elapsed < 0) {
      const count = Math.ceil(-elapsed / beat);
      if (count !== lastCount) {
        lastCount = count;
        get('feedback').textContent = `Starting in ${count}`;
      }
    } else {
      if (phase === 'countdown') {
        phase = 'playing';
        document.body.classList.remove('countdown');
        document.body.classList.add('playing');
        get('status').textContent = 'Playing';
        get('feedback').textContent = 'Play the glowing pair';
      }
      syncNotes(elapsed);
      renderTime(elapsed);
    }
    frame = requestAnimationFrame(animate);
  }

  function begin() {
    unlockAudio();
    clearActive();
    for (const [index, timer] of flashes) {
      clearTimeout(timer);
      pads[index].classList.remove('hit');
    }
    flashes.clear();
    notes = makeChart();
    nextNote = score = hits = combo = attempts = lastCount = 0;
    startTime = performance.now() + countIn;
    audioStep = -countIn / (beat / 2);
    phase = 'countdown';
    document.body.classList.remove('finished');
    document.body.classList.add('countdown');
    get('status').textContent = 'Count in';
    get('start-label').textContent = 'Stop';
    renderStats();
    renderTime(0);
    animate();
  }

  const pages = new Map([
    ['#start', { screen: 'launch', focus: 'launch-title', title: 'Rhythm Grid' }],
    ['#modes', { screen: 'mode-screen', focus: 'mode-title', title: 'Select a mode' }],
    ['#songs/normal', { screen: 'song-screen', focus: 'song-title', title: 'Select a song' }]
  ]);
  for (const [slug, track] of tracks) {
    const url = '#play/normal/' + slug;
    pages.set(url, { screen: 'game-screen', focus: 'game-board', title: track.title, slug });
    get('song-' + slug).addEventListener('click', () => navigate(url, true));
  }
  let currentUrl = null;

  function leaveGame() {
    if (phase === 'playing' || phase === 'countdown') finish(false);
    // Closing the context also stops sounds already scheduled for the next beat.
    if (audio) {
      audio.close().catch(() => {});
      audio = master = noise = null;
    }
    for (const [index, timer] of flashes) {
      clearTimeout(timer);
      pads[index].classList.remove('hit');
    }
    flashes.clear();
    document.body.classList.remove('finished');
    phase = 'idle';
  }

  function showPage(startRound = false) {
    let url = location.hash;
    if (!pages.has(url)) {
      url = '#start';
      history.replaceState(null, '', url);
    }
    if (url === currentUrl) return;
    const previous = pages.get(currentUrl);
    const page = pages.get(url);
    if (previous?.slug) leaveGame();
    if (previous) get(previous.screen).hidden = true;
    else get('launch').hidden = true;
    get(page.screen).hidden = false;
    currentUrl = url;
    document.title = page.title + ' · Padline';
    get('mode-message').textContent = '';

    if (page.slug) {
      selectTrack(page.slug);
      get('game-screen').classList.toggle('afterglow', page.slug === 'afterglow');
      score = combo = hits = attempts = 0;
      renderStats();
      renderTime(0);
      get('status').textContent = 'Ready';
      get('feedback').textContent = initialFeedback;
      get('start-label').textContent = 'Start game';
      if (startRound) begin();
    }
    get(page.focus).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function navigate(url, startRound = false) {
    if (currentUrl === url) return;
    history.pushState({ from: currentUrl }, '', url);
    showPage(startRound);
  }

  function goBack(parentUrl) {
    if (history.state?.from === parentUrl) {
      history.back();
    } else {
      // A bookmarked page can be the first entry in this tab.
      history.replaceState(null, '', parentUrl);
      showPage();
    }
  }

  window.addEventListener('popstate', () => showPage());
  window.addEventListener('hashchange', () => showPage());
  get('launch-start').addEventListener('click', () => navigate('#modes'));
  get('normal-mode').addEventListener('click', () => navigate('#songs/normal'));
  get('modes-back').addEventListener('click', () => goBack('#start'));
  get('songs-back').addEventListener('click', () => goBack('#modes'));
  get('game-back').addEventListener('click', () => goBack('#songs/normal'));
  for (const [id, name] of [['competitive-mode', 'Competitive Mode'], ['hard-mode', 'Hard Mode']]) {
    get(id).addEventListener('click', () => {
      get('mode-message').textContent = name + ' is currently under development.';
    });
  }

  get('start').addEventListener('click', () => {
    if (phase === 'playing' || phase === 'countdown') finish(false);
    else begin();
  });
  get('sound').addEventListener('click', () => {
    muted = !muted;
    if (!muted) unlockAudio();
    writeSetting(muteKey, muted);
    renderSound();
  });
  document.addEventListener('keydown', event => {
    if (!get('launch').hidden && event.key === 'Enter' && !event.isComposing &&
        !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (!event.repeat) navigate('#modes');
      return;
    }
    if (phase !== 'playing' || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toUpperCase();
    if (!controls.has(key)) return;
    event.preventDefault();
    if (!event.repeat) press(event.code || key, key);
  });
  document.addEventListener('keyup', event => release(event.code || event.key.toUpperCase()));
  window.addEventListener('blur', resetControls);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (phase === 'countdown' || phase === 'playing')) finish(false);
  });
  get('feedback').textContent = initialFeedback;
  renderStats();
  renderTime(0);
  renderSound();
  showPage();
})();
