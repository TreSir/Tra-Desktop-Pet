'use strict';

// ═══════════════════════════════════════════════════════════════
// renderer/sound.js — 零外部依赖 Web Audio API 程序化音效引擎
// 纯数学合成，无需任何外部音频文件，极小极轻
// ═══════════════════════════════════════════════════════════════

const SoundFX = (() => {
  let ctx = null;
  let enabled = true;
  let volume = 0.5;

  function initCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freq, type, duration, startVol = 0.3, endVol = 0.001, freqEnd = null) {
    if (!enabled) return;
    const ac = initCtx();
    if (!ac) return;

    try {
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (freqEnd != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
      }

      gain.gain.setValueAtTime(startVol * volume, now);
      gain.gain.exponentialRampToValueAtTime(endVol * volume, now + duration);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (e) {
      // Audio errors should never crash the app
    }
  }

  const sfx = {
    // 抚摸桌宠（温润小可爱音）
    pet() {
      playTone(587.33, 'sine', 0.12, 0.22, 0.001, 880);
    },

    // 连击（随连击数音调升高）
    combo(count = 1) {
      const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
      const pitch = notes[Math.min(Math.max(0, count - 1), notes.length - 1)] || 523.25;
      playTone(pitch, 'sine', 0.14, 0.28, 0.001, pitch * 1.15);
    },

    // 获得金币（经典清脆双音双跳）
    coin() {
      if (!enabled) return;
      playTone(987.77, 'sine', 0.08, 0.32, 0.01);
      setTimeout(() => {
        playTone(1318.51, 'sine', 0.2, 0.38, 0.001);
      }, 55);
    },

    // 进食（爽快咀嚼声）
    eat() {
      if (!enabled) return;
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          playTone(340 - i * 40, 'triangle', 0.06, 0.22, 0.01, 160);
        }, i * 65);
      }
    },

    // 空中接住受身（欢快四音上行大琶音）
    catch() {
      if (!enabled) return;
      const arpeggio = [523.25, 659.25, 783.99, 1046.5];
      arpeggio.forEach((freq, idx) => {
        setTimeout(() => {
          playTone(freq, 'sine', 0.14, 0.32, 0.001, freq * 1.05);
        }, idx * 45);
      });
    },

    // 落地弹跳
    bounce(intensity = 1) {
      const vol = Math.min(0.35, 0.12 + intensity * 0.02);
      playTone(130, 'sine', 0.09, vol, 0.001, 55);
    },

    // 睡觉打瞌睡
    sleep() {
      playTone(440, 'sine', 0.35, 0.14, 0.001, 330);
    },

    // 唤醒
    wake() {
      playTone(392, 'sine', 0.12, 0.18, 0.001, 659.25);
    },

    // 舞蹈节奏
    dance(step = 0) {
      const freqs = [440, 523.25, 659.25, 587.33];
      const f = freqs[step % freqs.length];
      playTone(f, 'triangle', 0.1, 0.18, 0.001, f * 0.95);
    }
  };

  return {
    play(name, ...args) {
      if (sfx[name]) sfx[name](...args);
    },
    setEnabled(val) {
      enabled = !!val;
    },
    isEnabled() {
      return enabled;
    },
    setVolume(val) {
      volume = Math.max(0, Math.min(1, val));
    },
    getVolume() {
      return volume;
    },
    unlock: initCtx,
  };
})();

window.SoundFX = SoundFX;
