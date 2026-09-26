'use strict';
const logEl = document.getElementById('log');
const RECORD_MS = 10_000;

function log(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  window.spike.appendLog(line);
}

window.spike.onAsrLog(log);

async function asrTest() {
  log('— Проверка распознавания (sherpa-onnx в utilityProcess)');
  log(`  итог: ${await window.spike.runAsr()}`);
}

function startTone() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  osc.frequency.value = 440;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  return { stop: () => { osc.stop(); ctx.close(); } };
}

async function recordTrack(stream, name) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  const meter = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
  }, 50);

  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start(1000);
  await new Promise((resolve) => setTimeout(resolve, RECORD_MS));
  recorder.stop();
  await stopped;
  clearInterval(meter);
  await ctx.close();
  return { name, peak, blob: new Blob(chunks, { type: 'audio/webm' }) };
}

const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
};

const VARIANTS = {
  A: { key: 'A', label: 'А (через экран)', mode: 'screen', audio: true },
  B: { key: 'B', label: 'Б (без экрана)', mode: 'frame', audio: true },
  V: { key: 'V', label: 'В (без своего звука)', mode: 'screen', audio: { restrictOwnAudio: true, ...RAW_AUDIO } },
  G: { key: 'G', label: 'Г (без экрана, без своего звука)', mode: 'frame', audio: { restrictOwnAudio: true, ...RAW_AUDIO } },
  D: { key: 'D', label: 'Д (без экрана, без обработки)', mode: 'frame', audio: { ...RAW_AUDIO } },
};

async function captureTest(variant, withTone) {
  const { key, label, mode, audio } = variant;
  log(`— Запись 10 с, вариант ${label}${withTone ? ', с тестовым тоном' : ''}`);
  await window.spike.setCaptureMode(mode);

  let mic = null;
  let display = null;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    log(`  микрофон: ${mic.getAudioTracks().map((t) => t.label).join(', ')}`);
  } catch (err) {
    log(`  FAIL микрофон — ${err.name}: ${err.message}`);
  }
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      audio,
      video: { width: 320, height: 240, frameRate: 1 },
    });
    const tracks = display.getAudioTracks();
    log(`  системный звук: дорожек ${tracks.length}; состояние ${tracks.map((t) => t.readyState).join('/') || '—'}`);
    if (tracks.length > 0) {
      log(`  настройки дорожки: ${JSON.stringify(tracks[0].getSettings())}`);
    }
  } catch (err) {
    log(`  FAIL системный звук — ${err.name}: ${err.message}`);
  }

  const tone = withTone ? startTone() : null;
  const jobs = [];
  if (mic) jobs.push(recordTrack(mic, 'mic'));
  if (display && display.getAudioTracks().length > 0) {
    jobs.push(recordTrack(new MediaStream(display.getAudioTracks()), 'system'));
  }
  const results = await Promise.all(jobs);
  if (tone) tone.stop();
  for (const stream of [mic, display]) stream?.getTracks().forEach((t) => t.stop());

  for (const r of results) {
    const saved = await window.spike.save(`${key}-${r.name}-${Date.now()}.webm`, await r.blob.arrayBuffer());
    const silent = r.peak < 0.001 ? ' — ТИШИНА' : '';
    log(`  ${r.name}: ${Math.round(r.blob.size / 1024)} КБ, пик ${r.peak.toFixed(3)}${silent} → ${saved}`);
  }
}

document.getElementById('asr').onclick = () => asrTest();
document.getElementById('capA').onclick = () => captureTest(VARIANTS.A, false);
document.getElementById('capB').onclick = () => captureTest(VARIANTS.B, false);
document.getElementById('capC').onclick = () => captureTest(VARIANTS.V, false);
document.getElementById('capD').onclick = () => captureTest(VARIANTS.G, false);
document.getElementById('capE').onclick = () => captureTest(VARIANTS.D, false);
document.getElementById('open').onclick = () => window.spike.openOutDir();
document.getElementById('copy').onclick = () => navigator.clipboard.writeText(logEl.textContent);

(async () => {
  const info = await window.spike.info();
  log(`Платформа: ${info.platform} ${info.osVersion}; Electron ${info.electron}`);
  if (!info.auto) return;
  await asrTest();
  await captureTest(VARIANTS.A, true);
  await captureTest(VARIANTS.B, true);
  await captureTest(VARIANTS.V, false);
  await captureTest(VARIANTS.G, false);
  await captureTest(VARIANTS.D, false);
  log('— Авто-проверка завершена');
  await window.spike.quit();
})();
