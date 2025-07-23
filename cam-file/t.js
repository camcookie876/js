// camcookie-renderer.js
// Renders .cami, .camv/.camg and plays .cams audio (inline or external),
// auto–scales canvases to fit viewport and adjusts on resize.

;(function() {
  // --- Globals ---
  const canvasList = [];

  // --- Parsing Helpers ---
  function parsePixels(text) {
    const regex = /{(\d+)\s*,\s*(\d+)\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)\s*}/g;
    const pixels = [];
    let m;
    while ((m = regex.exec(text))) {
      pixels.push({
        x: +m[1], y: +m[2],
        r: +m[3], g: +m[4], b: +m[5]
      });
    }
    return pixels;
  }

  function extractBlocks(str) {
    const blocks = [];
    let depth = 0, start = -1;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      }
      if (str[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          blocks.push(str.slice(start, i + 1));
          start = -1;
        }
      }
    }
    return blocks;
  }

  function parseAnimBlock(text) {
    let content = text.replace(/^{{|}}$/g, '');
    const frameRx = /{(\d+)\s*\{([\s\S]*?)\}\s*}/g;
    const frames = [];
    let f;
    while ((f = frameRx.exec(content))) {
      frames.push({
        index: +f[1],
        pixels: parsePixels(f[2]),
        raw: f[0]
      });
    }
    return frames.sort((a, b) => a.index - b.index);
  }

  // --- Audio Parsing Helpers ---
  // Inline PCM data
  function parseHeaderAudio(text) {
    const hdrRx = /audio\s*:\s*{([\s\S]*?)\n\s*}/;
    const m = hdrRx.exec(text);
    if (!m) return null;
    const objText = '{' +
      m[1]
        .replace(/([A-Za-z0-9_]+)\s*:/g, '"$1":')
        .replace(/,(\s*})/g, '$1') +
      '}';
    return JSON.parse(objText);
  }

  // External .cams source
  function parseAudioSrc(text) {
    const srcRx = /audio\s*:\s*{\s*src\s*:\s*"([^"]+)"\s*}/;
    const m = srcRx.exec(text);
    return m ? m[1] : null;
  }

  // Parse .cams file text into an object
  function parseCamsFile(text) {
    const jsonText = '{' +
      text
        .replace(/#.*$/gm, '')                     // strip comments
        .replace(/([A-Za-z0-9_]+)\s*:/g, '"$1":')  // quote keys
        .replace(/,(\s*})/g, '$1') +               // strip trailing commas
      '}';
    return JSON.parse(jsonText);
  }

  // --- Web Audio Playback ---
  function playInlinePCM(audioDef) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const length = Math.ceil(
      Math.max(...audioDef.data.map(p => p.t)) + 1
    );
    const buffer = ctx.createBuffer(
      audioDef.channels,
      length,
      audioDef.sampleRate
    );
    const channelData = buffer.getChannelData(0);
    audioDef.data.forEach(({ t, v }) => {
      if (t < channelData.length) channelData[t] = v;
    });
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = !!audioDef.loop;
    source.connect(ctx.destination);
    source.start(0);
  }

  async function handleAnimBlock(rawText) {
    // 1) Inline PCM?
    const inline = parseHeaderAudio(rawText);
    if (inline) playInlinePCM(inline);

    // 2) External .cams?
    const src = parseAudioSrc(rawText);
    if (src) {
      try {
        const res = await fetch(src);
        const camsText = await res.text();
        const audioDef = parseCamsFile(camsText);
        playInlinePCM(audioDef);
      } catch (err) {
        console.error('Failed loading .cams:', src, err);
      }
    }

    // 3) Render animation frames
    const frames = parseAnimBlock(rawText);
    renderAnim(frames);
  }

  // --- Canvas Resizing ---
  function adjustAllCanvases() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    canvasList.forEach(({ canvas, nativeW, nativeH }) => {
      const scale = Math.min(vw / nativeW, vh / nativeH, 1);
      canvas.style.width  = nativeW * scale + 'px';
      canvas.style.height = nativeH * scale + 'px';
    });
  }

  // --- Rendering ---
  function renderStatic(pixels) {
    if (!pixels.length) return;
    const unit = 10;
    const maxX = Math.max(...pixels.map(p => p.x));
    const maxY = Math.max(...pixels.map(p => p.y));
    const nW = (maxX + 1) * unit;
    const nH = (maxY + 1) * unit;

    const c = document.createElement('canvas');
    c.width  = nW;
    c.height = nH;
    c.style.border = '1px solid #ccc';
    c.style.margin = '8px';

    const ctx = c.getContext('2d');
    pixels.forEach(p => {
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.fillRect(p.x * unit, p.y * unit, unit, unit);
    });

    document.body.appendChild(c);
    canvasList.push({ canvas: c, nativeW: nW, nativeH: nH });
  }

  function renderAnim(frames) {
    if (!frames.length) return;
    const unit = 10;
    const allPixels = frames.flatMap(f => f.pixels);
    const maxX = Math.max(...allPixels.map(p => p.x));
    const maxY = Math.max(...allPixels.map(p => p.y));
    const nW = (maxX + 1) * unit;
    const nH = (maxY + 1) * unit;

    const c = document.createElement('canvas');
    c.width  = nW;
    c.height = nH;
    c.style.border = '1px solid #ccc';
    c.style.margin = '8px';

    const ctx = c.getContext('2d');
    document.body.appendChild(c);
    canvasList.push({ canvas: c, nativeW: nW, nativeH: nH });

    let idx = 0;
    const fps = 2;
    setInterval(() => {
      ctx.clearRect(0, 0, nW, nH);
      frames[idx].pixels.forEach(p => {
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(p.x * unit, p.y * unit, unit, unit);
      });
      idx = (idx + 1) % frames.length;
    }, 1000 / fps);
  }

  // --- CSS & HTML Scanner ---
  function scanAllText() {
    let txt = document.documentElement.innerHTML;
    document.querySelectorAll('style').forEach(s => txt += s.innerHTML);
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules) {
          txt += rule.cssText;
        }
      } catch {}
    }
    return txt;
  }

  // --- Initialization ---
  window.addEventListener('load', async () => {
    const content = scanAllText();
    const blocks  = extractBlocks(content);
    const pixRx   = /{ *\d+ *, *\d+ *\( *\d+ *, *\d+ *, *\d+ *\) *}/;
    const animRx  = /{\s*\d+\s*\{[\s\S]*?\}\s*}/;

    for (let block of blocks) {
      if (animRx.test(block)) {
        await handleAnimBlock(block);
      }
      else if (pixRx.test(block)) {
        renderStatic(parsePixels(block));
      }
    }

    adjustAllCanvases();
    window.addEventListener('resize', adjustAllCanvases);
  });
})();