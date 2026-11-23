// 효과음은 전부 WebAudio로 합성한다(외부 음원 없음).
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.6;
  private ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  unlock() { this.ensure(); }
  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }
  private tone(f: number, dur: number, vol: number, type: OscillatorType = 'sine', to = f, delay = 0, g = 1) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), a = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    a.gain.setValueAtTime(vol * g, t); a.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(a); a.connect(this.master!); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, type: BiquadFilterType, f: number, q = 1, to = f, delay = 0, g = 1) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), a = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t); if (to !== f) fl.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    a.gain.setValueAtTime(vol * g, t); a.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(a); a.connect(this.master!); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  /** g: 거리 감쇠 등 음량 배율 */
  play(name: string, g = 1) {
    const T = this.tone.bind(this), Nz = this.noise.bind(this);
    switch (name) {
      // 총기별 발사음: 음 높이와 길이, 잡음 색으로 구분
      case 'shot_ar': Nz(0.11, 0.5, 'bandpass', 1500, 0.8, 500, 0, g); T(210, 0.09, 0.45, 'triangle', 80, 0, g); break;
      case 'shot_smg': Nz(0.06, 0.4, 'bandpass', 2600, 1.2, 1200, 0, g); T(340, 0.05, 0.3, 'square', 160, 0, g * 0.6); break;
      case 'shot_shotgun': Nz(0.3, 0.75, 'lowpass', 2400, 0.5, 200, 0, g); T(120, 0.22, 0.6, 'sine', 40, 0, g); break;
      case 'shot_sniper': Nz(0.45, 0.6, 'bandpass', 900, 0.6, 150, 0, g); T(900, 0.12, 0.35, 'sawtooth', 90, 0, g); T(70, 0.4, 0.5, 'sine', 35, 0, g); break;
      case 'shot_pistol': Nz(0.07, 0.4, 'bandpass', 2000, 1, 900, 0, g); T(520, 0.06, 0.35, 'triangle', 200, 0, g); break;
      case 'shot_revolver': Nz(0.2, 0.6, 'bandpass', 1100, 0.7, 300, 0, g); T(260, 0.18, 0.55, 'triangle', 60, 0, g); break;
      case 'hit': T(1700, 0.05, 0.3, 'square', 1700, 0, g * 0.5); break;
      case 'head': T(2300, 0.05, 0.3, 'square'); T(3100, 0.07, 0.3, 'square', 3100, 0.05); break;
      case 'kill': T(660, 0.09, 0.35, 'triangle'); T(880, 0.09, 0.35, 'triangle', 880, 0.08); T(1320, 0.2, 0.35, 'triangle', 1320, 0.16); Nz(0.12, 0.3, 'highpass', 3000); break;
      case 'pop': Nz(0.1, 0.45, 'bandpass', 900, 2, 2400, 0, g); T(300, 0.12, 0.4, 'sine', 900, 0, g); break;
      case 'hurt': T(150, 0.14, 0.55, 'sine', 70); Nz(0.06, 0.25, 'lowpass', 600); break;
      case 'out': T(520, 0.4, 0.4, 'triangle', 110); T(390, 0.45, 0.25, 'sine', 80, 0.05); break;
      case 'swing': Nz(0.16, 0.3, 'bandpass', 700, 1.5, 2600, 0, g); break;
      case 'meleeHit': T(190, 0.09, 0.6, 'square', 90); Nz(0.05, 0.4, 'highpass', 2500); break;
      case 'draw': Nz(0.09, 0.14, 'bandpass', 2400, 1, 3800); break;
      case 'tick': T(2100, 0.025, 0.14, 'triangle'); break;
      case 'spin': Nz(0.42, 0.14, 'bandpass', 900, 5, 3400); T(1900, 0.02, 0.06, 'triangle', 1900, 0.1); T(1900, 0.02, 0.06, 'triangle', 1900, 0.2); T(1900, 0.02, 0.06, 'triangle', 1900, 0.3); break;
      case 'spin2': Nz(0.15, 0.14, 'bandpass', 1500, 5, 3200); break;
      case 'catch': T(240, 0.05, 0.3, 'square', 150); T(2600, 0.02, 0.12, 'triangle'); break;
      case 'clack': T(2500, 0.035, 0.22, 'triangle', 1900); Nz(0.02, 0.2, 'highpass', 5000); break;
      case 'clack2': T(3200, 0.035, 0.22, 'triangle', 2500); Nz(0.02, 0.2, 'highpass', 6000); break;
      case 'magout': T(700, 0.04, 0.2, 'square', 400); Nz(0.04, 0.15, 'highpass', 3000); break;
      case 'magin': T(480, 0.05, 0.25, 'square', 760); Nz(0.03, 0.2, 'highpass', 2500); break;
      case 'rack': Nz(0.05, 0.25, 'bandpass', 2800, 2); T(900, 0.03, 0.18, 'square', 900, 0.06); break;
      case 'bolt': Nz(0.06, 0.25, 'bandpass', 1800, 2); T(620, 0.04, 0.2, 'square', 620, 0.14); break;
      case 'pump': Nz(0.07, 0.3, 'bandpass', 1300, 2, 800, 0, g); Nz(0.07, 0.3, 'bandpass', 900, 2, 1500, 0.12, g); break;
      case 'shell': T(880, 0.04, 0.2, 'triangle', 660); break;
      case 'dry': T(1200, 0.02, 0.15, 'square'); break;
      case 'ui': T(880, 0.04, 0.15, 'triangle', 1100); break;
      case 'ready': T(660, 0.07, 0.25, 'triangle'); T(990, 0.1, 0.25, 'triangle', 990, 0.07); break;
      case 'beep': T(700, 0.09, 0.25, 'square', 700, 0, 0.5); break;
      case 'go': T(1050, 0.25, 0.3, 'square', 1050, 0, 0.5); break;
      case 'roundWin': [523, 659, 784].forEach((f, i) => T(f, 0.16, 0.3, 'triangle', f, i * 0.09)); break;
      case 'roundLose': [440, 370, 294].forEach((f, i) => T(f, 0.2, 0.28, 'triangle', f, i * 0.11)); break;
      case 'matchWin': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => T(f, 0.2, 0.32, 'triangle', f, i * 0.12)); break;
      case 'matchLose': [392, 349, 311, 262].forEach((f, i) => T(f, 0.3, 0.3, 'triangle', f, i * 0.16)); break;
    }
  }
}
