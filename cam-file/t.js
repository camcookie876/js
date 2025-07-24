;(function(){
  const unit = 10; // pixel size
  const canvasList = [];

  // 🧠 Parse pixel blocks: {x,y(r,g,b)}
  function parsePixels(text) {
    const regex = /{(\d+),\s*(\d+)\((\d+),(\d+),(\d+)\)}/g;
    let m, pixels = [];
    while ((m = regex.exec(text))) {
      pixels.push({ x:+m[1], y:+m[2], r:+m[3], g:+m[4], b:+m[5] });
    }
    return pixels;
  }

  // 🧠 Extract top-level blocks with { … } or {{ … }}
  function extractBlocks(str) {
    const blocks = [];
    let depth = 0, start = -1;
    for (let i=0; i<str.length; i++) {
      if (str[i]==='{') { if (depth===0) start = i; depth++; }
      if (str[i]==='}') { depth--; if (depth===0 && start>=0) { blocks.push(str.slice(start,i+1)); start=-1; } }
    }
    return blocks;
  }

  // 📦 Parse animation frames
  function parseAnimBlock(text) {
    let content = text.replace(/^{{|}}$/g, '');
    const frameRx = /{(\d+)\s*\{([\s\S]*?)\}}/g;
    let m, frames=[];
    while ((m = frameRx.exec(content))) {
      frames.push({ index:+m[1], pixels:parsePixels(m[2]) });
    }
    return frames.sort((a,b)=>a.index-b.index);
  }

  // 🔊 Parse inline audio block
  function parseHeaderAudio(text) {
    const rx = /audio\s*:\s*{([\s\S]*?)}/;
    const m = rx.exec(text);
    if (!m) return null;
    const jsonText = '{' +
      m[1]
        .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
        .replace(/,(\s*})/g, '$1') +
      '}';
    try {
      return JSON.parse(jsonText);
    } catch { return null; }
  }

  // 🔊 Play PCM sound from cams
  function playInlinePCM(audioDef) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.max(...audioDef.data.map(p=>p.t))+1;
    const buffer = ctx.createBuffer(audioDef.channels, len, audioDef.sampleRate);
    const ch0 = buffer.getChannelData(0);
    audioDef.data.forEach(p => { if (p.t < ch0.length) ch0[p.t] = p.v; });
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.loop = false;
    src.start();
  }

  // 🎨 Draw static image block
  function renderStatic(pixels) {
    const maxX = Math.max(...pixels.map(p=>p.x));
    const maxY = Math.max(...pixels.map(p=>p.y));
    const canvas = document.createElement('canvas');
    canvas.width  = (maxX+1)*unit;
    canvas.height = (maxY+1)*unit;
    canvas.style.border = '1px solid #ccc';
    canvas.style.margin = '1rem';
    const ctx = canvas.getContext('2d');
    pixels.forEach(p => {
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.fillRect(p.x*unit, p.y*unit, unit, unit);
    });
    document.body.appendChild(canvas);
    canvasList.push(canvas);
  }

  // 🎬 Animate frames
  function renderAnim(frames) {
    const all = frames.flatMap(f => f.pixels);
    const maxX = Math.max(...all.map(p=>p.x));
    const maxY = Math.max(...all.map(p=>p.y));
    const canvas = document.createElement('canvas');
    canvas.width  = (maxX+1)*unit;
    canvas.height = (maxY+1)*unit;
    canvas.style.border = '1px solid #ccc';
    canvas.style.margin = '1rem';
    const ctx = canvas.getContext('2d');
    document.body.appendChild(canvas);
    canvasList.push(canvas);

    let idx = 0;
    setInterval(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frames[idx].pixels.forEach(p => {
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(p.x*unit, p.y*unit, unit, unit);
      });
      idx = (idx + 1) % frames.length;
    }, 500);
  }

  // 🔍 Scan all visible content
  function scanAllText() {
    let text = document.documentElement.innerHTML;
    document.querySelectorAll('style').forEach(s => text += s.innerHTML);
    document.querySelectorAll('script').forEach(s => text += s.textContent);
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules) { text += rule.cssText; }
      } catch {}
    }
    return text;
  }

  // 🚀 Run on page load
  window.addEventListener('load', () => {
    const text = scanAllText();
    const blocks = extractBlocks(text);
    for (let b of blocks) {
      if (b.startsWith('{{')) {
        const audio = parseHeaderAudio(b);
        if (audio) playInlinePCM(audio);
        const frames = parseAnimBlock(b);
        renderAnim(frames);
      } else if (/{\d+,\s*\d+\(\d+,\d+,\d+\)}/.test(b)) {
        const pixels = parsePixels(b);
        renderStatic(pixels);
      }
    }
  });
})();