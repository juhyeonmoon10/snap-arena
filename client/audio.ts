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
      // 총성: 날카로운 파열음 + 저음 타격 + 벽에 번지는 꼬리. 총마다 무게와 길이가 다르다
      case 'shot_ar': Nz(0.05, 0.8, 'highpass', 1800, 0.7, 900, 0, g); T(150, 0.11, 0.7, 'sine', 48, 0, g); Nz(0.32, 0.3, 'lowpass', 1600, 0.5, 260, 0.02, g); break;
      case 'shot_smg': Nz(0.035, 0.6, 'highpass', 2600, 0.7, 1400, 0, g); T(210, 0.06, 0.45, 'sine', 80, 0, g); Nz(0.16, 0.2, 'lowpass', 2200, 0.5, 500, 0.015, g); break;
      case 'shot_shotgun': Nz(0.09, 1.0, 'lowpass', 3200, 0.5, 500, 0, g); T(95, 0.26, 0.95, 'sine', 30, 0, g); Nz(0.6, 0.42, 'lowpass', 1100, 0.5, 140, 0.03, g); break;
      case 'shot_sniper': Nz(0.06, 1.0, 'highpass', 1400, 0.6, 500, 0, g); T(110, 0.3, 1.0, 'sine', 28, 0, g); Nz(0.95, 0.45, 'lowpass', 1300, 0.5, 110, 0.03, g); T(2400, 0.05, 0.12, 'sine', 700, 0, g); break;
      case 'shot_pistol': Nz(0.04, 0.7, 'highpass', 2000, 0.7, 1000, 0, g); T(180, 0.08, 0.55, 'sine', 60, 0, g); Nz(0.22, 0.22, 'lowpass', 1800, 0.5, 320, 0.02, g); break;
      case 'shot_revolver': Nz(0.06, 0.9, 'highpass', 1500, 0.6, 600, 0, g); T(125, 0.2, 0.85, 'sine', 36, 0, g); Nz(0.5, 0.36, 'lowpass', 1400, 0.5, 170, 0.03, g); break;
      case 'hit': Nz(0.03, 0.35, 'bandpass', 3200, 3, 2200, 0, g); T(900, 0.03, 0.12, 'sine', 600, 0, g); break;
      case 'head': Nz(0.03, 0.4, 'bandpass', 4200, 4, 3000); T(1500, 0.07, 0.22, 'sine', 1100); break;
      case 'kill': Nz(0.04, 0.45, 'bandpass', 3000, 3, 1800); T(520, 0.12, 0.3, 'sine', 300); T(260, 0.2, 0.3, 'sine', 180, 0.05); break;
      case 'pop': T(90, 0.22, 0.6, 'sine', 45, 0.12, g); Nz(0.18, 0.3, 'lowpass', 500, 0.7, 180, 0.12, g); break; // 쓰러지는 소리
      case 'hurt': T(150, 0.14, 0.55, 'sine', 70); Nz(0.06, 0.25, 'lowpass', 600); break;
      case 'out': T(180, 0.5, 0.45, 'sine', 50); Nz(0.5, 0.2, 'lowpass', 700, 0.6, 120); break;
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
      case 'beep': T(620, 0.07, 0.2, 'sine'); break;
      case 'go': T(930, 0.3, 0.25, 'sine'); break;
      case 'roundWin': T(392, 0.22, 0.22, 'sine'); T(587, 0.4, 0.22, 'sine', 587, 0.14); break;
      case 'roundLose': T(330, 0.22, 0.22, 'sine'); T(220, 0.45, 0.22, 'sine', 220, 0.14); break;
      case 'matchWin': [392, 494, 587, 784].forEach((f, i) => T(f, 0.5, 0.2, 'sine', f, i * 0.16)); break;
      case 'matchLose': [330, 294, 247, 196].forEach((f, i) => T(f, 0.5, 0.2, 'sine', f, i * 0.18)); break;
    }
  }
}
