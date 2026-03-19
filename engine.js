import { WaveformRenderer } from './pkg/rust_dj.js';

export let audioCtx = null;
export function getAudioCtx(resume = false) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (resume && audioCtx.state === 'suspended') { audioCtx.resume().catch(()=>{}); }
    return audioCtx;
}

export function setSmooth(param, value) {
    if (!param || !audioCtx) return;
    param.setTargetAtTime(value, audioCtx.currentTime, 0.03);
}

export function bindPointerDown(element, callback) {
    if(!element) return;
    element.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); callback(e); });
}

export function mapEqCurve(val) {
    if (val >= 0.5) return (val - 0.5) * 4;
    else return (val - 0.5) * 80;
}

export function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00.0";
    let mins = Math.floor(seconds / 60);
    let secs = Math.floor(seconds % 60);
    let tenths = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

export class TrackDB {
    constructor(onReady) {
        this.db = null;
        const req = indexedDB.open("RustDJ_DB", 1);
        req.onupgradeneeded = (e) => {
            let db = e.target.result;
            if (db.objectStoreNames.contains('tracks')) db.deleteObjectStore('tracks');
            db.createObjectStore('tracks', { autoIncrement: true });
        };
        req.onsuccess = (e) => { this.db = e.target.result; if(onReady) onReady(); };
    }
    async addFile(file) {
        return new Promise((resolve) => {
            const tx = this.db.transaction('tracks', 'readwrite');
            const req = tx.objectStore('tracks').put(file);
            req.onsuccess = (e) => resolve(e.target.result);
        });
    }
    async getFile(id) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(null);
            const tx = this.db.transaction('tracks', 'readonly');
            const req = tx.objectStore('tracks').get(id);
            req.onsuccess = () => resolve(req.result);
        });
    }
    async deleteFile(id) {
        const tx = this.db.transaction('tracks', 'readwrite');
        tx.objectStore('tracks').delete(id);
    }
    async wipeDrive() {
        const tx = this.db.transaction('tracks', 'readwrite');
        tx.objectStore('tracks').clear();
    }
}

export class TouchFader {
    constructor(el, defaultVal, onChange) {
        this.el = el;
        if(!this.el) return;
        this.thumb = this.el.querySelector('.fader-thumb');
        this.value = defaultVal;
        this.defaultVal = defaultVal;
        this.onChange = onChange;
        this.activePointerId = null;
        this.lastTap = 0;
        this.startPos = 0;
        this.startVal = 0;
        this.easeAnimFrame = null;

        this.el.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.el.addEventListener('pointermove', this.onPointerMove.bind(this));
        this.el.addEventListener('pointerup', this.onPointerUp.bind(this));
        this.el.addEventListener('pointercancel', this.onPointerUp.bind(this));
        this.el.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.easeAnimFrame) { cancelAnimationFrame(this.easeAnimFrame); this.easeAnimFrame = null; }
            let isVert = this.el.clientHeight > this.el.clientWidth;
            let delta = e.deltaY > 0 ? -0.05 : 0.05;
            if (!isVert) delta = e.deltaY > 0 ? 0.05 : -0.05;
            this.setValue(this.value + delta);
        }, { passive: false });

        window.addEventListener('resize', () => this.updateThumb());
        setTimeout(() => this.updateThumb(), 100);
    }
    setValue(val, triggerCallback = true) {
        this.value = Math.max(0, Math.min(1, val));
        this.updateThumb();
        if (triggerCallback && this.onChange) this.onChange(this.value);
    }
    easeToValue(targetVal, durationMs) {
        if (this.activePointerId !== null) return;
        if (durationMs <= 0) { this.setValue(targetVal); return; }
        if (this.easeAnimFrame) cancelAnimationFrame(this.easeAnimFrame);
        const startVal = this.value;
        const startTime = performance.now();
        const animate = (currentTime) => {
            if (this.activePointerId !== null) { this.easeAnimFrame = null; return; }
            let elapsed = currentTime - startTime;
            let t = Math.min(elapsed / durationMs, 1.0);
            let easeT = 1 - Math.pow(1 - t, 3);
            this.setValue(startVal + (targetVal - startVal) * easeT);
            if (t < 1.0) this.easeAnimFrame = requestAnimationFrame(animate);
            else this.easeAnimFrame = null;
        };
        this.easeAnimFrame = requestAnimationFrame(animate);
    }
    onPointerDown(e) {
        e.preventDefault(); e.stopPropagation();
        if (this.easeAnimFrame) { cancelAnimationFrame(this.easeAnimFrame); this.easeAnimFrame = null; }
        let now = Date.now();
        if (now - this.lastTap < 300) { this.setValue(this.defaultVal); return; }
        this.lastTap = now;
        if (this.activePointerId !== null) return;
        this.activePointerId = e.pointerId;
        this.el.setPointerCapture(e.pointerId);
        const rect = this.el.getBoundingClientRect();
        let isVert = rect.height > rect.width;
        this.startPos = isVert ? e.clientY : e.clientX;
        this.startVal = this.value;
    }
    onPointerMove(e) {
        if (this.activePointerId !== e.pointerId) return;
        const rect = this.el.getBoundingClientRect();
        let isVert = rect.height > rect.width;
        const padding = 15;
        if (isVert) {
            const trackHeight = Math.max(1, rect.height - (padding * 2));
            let deltaY = e.clientY - this.startPos;
            this.setValue(this.startVal - (deltaY / trackHeight));
        } else {
            const trackWidth = Math.max(1, rect.width - (padding * 2));
            let deltaX = e.clientX - this.startPos;
            this.setValue(this.startVal + (deltaX / trackWidth));
        }
    }
    onPointerUp(e) {
        if (this.activePointerId === e.pointerId) {
            this.activePointerId = null;
            this.el.releasePointerCapture(e.pointerId);
        }
    }
    updateThumb() {
        if (!this.el) return;
        const rect = this.el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        let isVert = rect.height > rect.width;
        if (isVert) {
            this.thumb.style.left = '50%';
            this.thumb.style.top = `calc(15px + (100% - 30px) * ${1.0 - this.value})`;
        } else {
            this.thumb.style.top = '50%';
            this.thumb.style.left = `calc(15px + (100% - 30px) * ${this.value})`;
        }
    }
}

export class Player {
    constructor(prefix, motorSettings, resetStateFunc, onMetaUpdate) {
        this.prefix = prefix;
        this.motorSettings = motorSettings;
        this.resetStateFunc = resetStateFunc;
        this.onMetaUpdate = onMetaUpdate;

        this.audioBuffer = null;
        this.rustRenderer = null;
        this.isPlaying = false;
        this.isCuePreviewing = false;
        this.cuePoint = 0;
        this.pausedAt = 0;
        this.lastFrameTime = 0;
        this.motorActive = true;
        this.motorSpeed = 1.0;
        this.baseZoomSeconds = 5.0;
        this.faderPitchPercent = 0.0;
        this.nativeBpm = 0;
        this.currentTrackId = null;

        // Track Browser State
        this.playlist = [];
        this.trackDB = null;
        this.browseIndex = -1;

        this.sourceNode = null;
        this.eqLow = null; this.eqMid = null; this.eqHi = null;
        this.filterNode = null; this.volGain = null;
        this.masterLimiter = null;

        this.ui = {
            timeDisplay: document.getElementById(prefix + 'time-display'),
            bpmDisplay: document.getElementById(prefix + 'bpm-display'),
            wrap: document.getElementById(prefix + 'wave-wrapper'),
            canvas: document.getElementById(prefix + 'canvas'),
            btnPlay: document.getElementById(prefix + 'btn-play'),
            btnCue: document.getElementById(prefix + 'btn-cue'),
            btnRewind: document.getElementById(prefix + 'btn-rewind'),
            btnMotor: document.getElementById(prefix + 'btn-motor'),
            readout: document.getElementById(prefix + 'pitch-readout'),

            // Browser UI
            btnBrowserPrev: document.getElementById(prefix + 'btn-prev'),
            btnBrowserNext: document.getElementById(prefix + 'btn-next'),
            btnBrowserLoad: document.getElementById(prefix + 'btn-load'),
            browserTitle: document.getElementById(prefix + 'browser-title'),
            browserMeta: document.getElementById(prefix + 'browser-meta'),
            browserWrap: document.getElementById(prefix + 'track-browser'),
        };

        const dpr = window.devicePixelRatio || 1;
        if(this.ui.canvas && this.ui.wrap) {
            this.ui.canvas.width = this.ui.wrap.clientWidth * dpr;
            this.ui.canvas.height = this.ui.wrap.clientHeight * dpr;
            this.ctx = this.ui.canvas.getContext('2d');
        }

        this.setupBrowserControls();
        this.setupTransportControls();

        const syncTempo = (v) => {
            this.faderPitchPercent = ((v - 0.5) * 2) * 16.0;
            this.updatePitchReadout();
            if(this.faderPitchH) this.faderPitchH.setValue(v, false);
            if(this.faderPitchV) this.faderPitchV.setValue(v, false);
        };
        this.faderPitchH = new TouchFader(document.getElementById(prefix + 'tempo-h'), 0.5, syncTempo);
        this.faderPitchV = new TouchFader(document.getElementById(prefix + 'tempo-v'), 0.5, syncTempo);
        this.faderHi = new TouchFader(document.getElementById(prefix + 'eq-hi'), 0.5, (v) => { if(this.eqHi) setSmooth(this.eqHi.gain, mapEqCurve(v)); });
        this.faderMid = new TouchFader(document.getElementById(prefix + 'eq-mid'), 0.5, (v) => { if(this.eqMid) setSmooth(this.eqMid.gain, mapEqCurve(v)); });
        this.faderLow = new TouchFader(document.getElementById(prefix + 'eq-low'), 0.5, (v) => { if(this.eqLow) setSmooth(this.eqLow.gain, mapEqCurve(v)); });
        this.faderFilter = new TouchFader(document.getElementById(prefix + 'filter-v'), 0.5, (v) => { this.updateFilter(v); });
        this.faderVol = new TouchFader(document.getElementById(prefix + 'vol-v'), 0.8, (v) => { if(this.volGain) setSmooth(this.volGain.gain, v); });

        const bindLabelReset = (id, faders, defaultVal) => {
            const el = document.getElementById(prefix + id);
            if (!el) return;
            bindPointerDown(el, (e) => {
                const rs = this.resetStateFunc();
                if (rs.mode === 'off') return;
                faders.forEach(f => {
                    if(f) { if (rs.mode === 'ease') f.easeToValue(defaultVal, rs.easeTimeMs); else f.setValue(defaultVal); }
                });
            });
        };
        bindLabelReset('lbl-tempo', [this.faderPitchH, this.faderPitchV], 0.5);
        bindLabelReset('lbl-hi', [this.faderHi], 0.5);
        bindLabelReset('lbl-mid', [this.faderMid], 0.5);
        bindLabelReset('lbl-low', [this.faderLow], 0.5);
        bindLabelReset('lbl-flt', [this.faderFilter], 0.5);
        bindLabelReset('lbl-vol', [this.faderVol], 0.8);

        this.animFrame = requestAnimationFrame(() => this.renderLoop());
    }

    // --- HARDWARE BROWSER LOGIC ---
    setupBrowserControls() {
        bindPointerDown(this.ui.btnBrowserPrev, () => this.browse(-1));
        bindPointerDown(this.ui.btnBrowserNext, () => this.browse(1));
        bindPointerDown(this.ui.btnBrowserLoad, () => this.loadBrowsedTrack());
    }

    refreshPlaylistData(tracks, trackDB) {
        this.playlist = tracks;
        this.trackDB = trackDB;
        if (this.browseIndex < 0 && tracks.length > 0) this.browseIndex = 0;
        if (this.browseIndex >= tracks.length && tracks.length > 0) this.browseIndex = tracks.length - 1;
        this.updateBrowserUI();
    }

    browse(dir) {
        if (this.playlist.length === 0) return;
        this.browseIndex += dir;
        if (this.browseIndex < 0) this.browseIndex = this.playlist.length - 1;
        if (this.browseIndex >= this.playlist.length) this.browseIndex = 0;
        this.updateBrowserUI();
    }

    updateBrowserUI() {
        if (!this.ui.browserTitle) return;
        if (this.playlist.length === 0) {
            this.ui.browserTitle.innerText = "NO TRACKS";
            this.ui.browserMeta.innerText = "GO TO 📂 TAB";
            this.ui.browserMeta.classList.remove('has-data');
            return;
        }
        let t = this.playlist[this.browseIndex];
        this.ui.browserTitle.innerText = t.name;
        if (t.bpm > 0) {
            this.ui.browserMeta.innerText = `${t.key} | ${t.bpm.toFixed(1)} BPM`;
            this.ui.browserMeta.classList.add('has-data');
        } else {
            this.ui.browserMeta.innerText = "TAP TO LOAD & ANALYZE";
            this.ui.browserMeta.classList.remove('has-data');
        }
    }

    async loadBrowsedTrack() {
        if (this.playlist.length === 0 || this.browseIndex < 0 || !this.trackDB) return;
        let t = this.playlist[this.browseIndex];
        const file = await this.trackDB.getFile(t.id);
        if (file) {
            this.currentTrackId = t.id;
            this.loadFile(t.name, file);
        }
    }

    // --- CDJ TRANSPORT LOGIC ---
    setupTransportControls() {
        bindPointerDown(this.ui.btnPlay, () => {
            if(!this.audioBuffer || !this.motorActive) return;
            getAudioCtx(true);
            if (this.isPlaying) {
                this.stopNode(); this.isPlaying = false;
                this.ui.btnPlay.classList.remove('active-play');
            } else {
                this.startNode(this.pausedAt); this.isPlaying = true;
                this.isCuePreviewing = false;
                this.ui.btnPlay.classList.add('active-play');
                if(this.ui.btnCue) this.ui.btnCue.classList.remove('active-cue');
            }
        });

        if(this.ui.btnCue) {
            this.ui.btnCue.addEventListener('pointerdown', (e) => {
                e.preventDefault(); e.stopPropagation();
                if(!this.audioBuffer || !this.motorActive) return;
                getAudioCtx(true);

                if (this.isPlaying) {
                    this.stopNode();
                    this.isPlaying = false;
                    this.pausedAt = this.cuePoint;
                    this.ui.btnPlay.classList.remove('active-play');
                    this.ui.btnCue.classList.add('active-cue');
                    setTimeout(()=> this.ui.btnCue.classList.remove('active-cue'), 150);
                } else {
                    if (Math.abs(this.pausedAt - this.cuePoint) < 0.05) {
                        this.isCuePreviewing = true;
                        this.startNode(this.cuePoint);
                        this.ui.btnCue.classList.add('active-cue');
                        this.ui.btnCue.setPointerCapture(e.pointerId);
                    } else {
                        this.cuePoint = this.pausedAt;
                        this.ui.btnCue.classList.add('active-cue');
                        setTimeout(()=> this.ui.btnCue.classList.remove('active-cue'), 150);
                    }
                }
            });

            this.ui.btnCue.addEventListener('pointermove', (e) => {
                if (!this.isCuePreviewing || !this.motorActive) return;
                const rect = this.ui.btnCue.getBoundingClientRect();
                const pad = 10;
                let isOutside = (e.clientX < rect.left - pad || e.clientX > rect.right + pad || e.clientY < rect.top - pad || e.clientY > rect.bottom + pad);
                if (isOutside && !this.isPlaying) {
                    this.isCuePreviewing = false;
                    this.isPlaying = true;
                    this.ui.btnCue.classList.remove('active-cue');
                    this.ui.btnPlay.classList.add('active-play');
                    this.ui.btnCue.releasePointerCapture(e.pointerId);
                }
            });

            this.ui.btnCue.addEventListener('pointerup', (e) => {
                if (this.isCuePreviewing) {
                    this.isCuePreviewing = false;
                    this.stopNode();
                    this.pausedAt = this.cuePoint;
                    this.ui.btnCue.classList.remove('active-cue');
                }
                if (this.ui.btnCue.hasPointerCapture(e.pointerId)) {
                    this.ui.btnCue.releasePointerCapture(e.pointerId);
                }
            });

            this.ui.btnCue.addEventListener('pointercancel', (e) => {
                if (this.isCuePreviewing) {
                    this.isCuePreviewing = false;
                    this.stopNode();
                    this.pausedAt = this.cuePoint;
                    this.ui.btnCue.classList.remove('active-cue');
                }
            });
        }

        bindPointerDown(this.ui.btnRewind, () => {
            if(!this.audioBuffer || !this.motorActive) return;
            getAudioCtx(true);
            if(this.isPlaying) { this.stopNode(); this.pausedAt = 0; this.startNode(0); }
            else { this.pausedAt = 0; }
        });

        bindPointerDown(this.ui.btnMotor, () => {
            this.motorActive = !this.motorActive;
            const toggleDisabled = (btn) => { if(btn) btn.classList.toggle('motor-disabled', !this.motorActive); };
            
            // Disable transport while motor is off, but DO NOT stop the actual web audio node.
            // The renderLoop playback rate will handle the spin-down naturally!
            toggleDisabled(this.ui.btnPlay);
            toggleDisabled(this.ui.btnCue);
            toggleDisabled(this.ui.btnRewind);

            if (this.motorActive) {
                this.ui.btnMotor.classList.remove('off');
            } else {
                this.ui.btnMotor.classList.add('off');
            }
        });
    }

    updateFilter(v) {
        if (!this.filterNode) return;
        if (v > 0.55) {
            this.filterNode.type = 'highpass';
            let normalized = (v - 0.55) / 0.45;
            let freq = 20 * Math.pow(500, normalized);
            setSmooth(this.filterNode.frequency, freq);
            this.filterNode.Q.value = 1.5;
        } else if (v < 0.45) {
            this.filterNode.type = 'lowpass';
            let normalized = (0.45 - v) / 0.45;
            let freq = 20000 / Math.pow(200, normalized);
            setSmooth(this.filterNode.frequency, freq);
            this.filterNode.Q.value = 1.5;
        } else {
            this.filterNode.type = 'lowpass';
            setSmooth(this.filterNode.frequency, 24000);
            this.filterNode.Q.value = 0.5;
        }
    }

    get actualPlaybackRate() { return Math.max(0.01, 1.0 + (this.faderPitchPercent / 100.0)); }

    updatePitchReadout() {
        if(!this.ui.readout) return;
        const sign = this.faderPitchPercent >= 0 ? '+' : '';
        this.ui.readout.innerText = `${sign}${this.faderPitchPercent.toFixed(2)}%`;
        if (this.faderPitchPercent === 0) this.ui.readout.style.color = '#ffaa00';
        else this.ui.readout.style.color = '#00e5ff';

        if (this.nativeBpm > 0 && this.ui.bpmDisplay) {
            let currentBpm = this.nativeBpm * this.actualPlaybackRate;
            this.ui.bpmDisplay.innerText = `BPM: ${currentBpm.toFixed(1)}`;
        }
    }

    async loadFile(name, file) {
        if (!file) return;

        if (this.isPlaying || this.isCuePreviewing) {
            this.stopNode(); this.isPlaying = false; this.isCuePreviewing = false;
            if(this.ui.btnPlay) this.ui.btnPlay.classList.remove('active-play');
            if(this.ui.btnCue) this.ui.btnCue.classList.remove('active-cue');
        }
        this.pausedAt = 0; this.cuePoint = 0; this.motorSpeed = 1.0;
        if (this.rustRenderer) { this.rustRenderer.free(); this.rustRenderer = null; }

        if (this.ui.browserWrap) this.ui.browserWrap.classList.add('is-loading');
        if (this.ui.bpmDisplay) this.ui.bpmDisplay.innerText = "BPM: --";

        const ctx = getAudioCtx(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            const samples = this.audioBuffer.getChannelData(0);

            this.rustRenderer = new WaveformRenderer(samples, this.audioBuffer.sampleRate);
            this.nativeBpm = this.rustRenderer.get_bpm();
            const nativeKey = this.rustRenderer.get_key();

            if (this.ui.browserWrap) this.ui.browserWrap.classList.remove('is-loading');

            this.updatePitchReadout();

            if(this.faderPitchH) this.faderPitchH.setValue(0.5);
            if(this.faderPitchV) this.faderPitchV.setValue(0.5);
            if(this.faderHi) this.faderHi.setValue(0.5);
            if(this.faderMid) this.faderMid.setValue(0.5);
            if(this.faderLow) this.faderLow.setValue(0.5);
            if(this.faderFilter) this.faderFilter.setValue(0.5);

            this.setupAudioGraph();

            if (this.currentTrackId !== null && this.onMetaUpdate) {
                this.onMetaUpdate(this.currentTrackId, this.nativeBpm, nativeKey);
            }

        } catch(err) {
            console.error(err);
            if (this.ui.browserWrap) {
                this.ui.browserWrap.classList.remove('is-loading');
                this.ui.browserTitle.innerText = "ERROR LOADING FILE";
            }
        }
    }

    setupAudioGraph() {
        if (this.volGain) return;
        const ctx = getAudioCtx();
        this.eqLow = ctx.createBiquadFilter(); this.eqLow.type = 'lowshelf'; this.eqLow.frequency.value = 250;
        this.eqMid = ctx.createBiquadFilter(); this.eqMid.type = 'peaking'; this.eqMid.frequency.value = 1000; this.eqMid.Q.value = 1;
        this.eqHi = ctx.createBiquadFilter(); this.eqHi.type = 'highshelf'; this.eqHi.frequency.value = 4000;
        this.filterNode = ctx.createBiquadFilter(); this.filterNode.type = 'lowpass'; this.filterNode.frequency.value = 24000;
        this.volGain = ctx.createGain();

        this.masterLimiter = ctx.createDynamicsCompressor();
        this.masterLimiter.threshold.value = -1.0;
        this.masterLimiter.knee.value = 0.0;
        this.masterLimiter.ratio.value = 20.0;
        this.masterLimiter.attack.value = 0.005;
        this.masterLimiter.release.value = 0.050;

        if(this.faderLow) this.eqLow.gain.value = mapEqCurve(this.faderLow.value);
        if(this.faderMid) this.eqMid.gain.value = mapEqCurve(this.faderMid.value);
        if(this.faderHi) this.eqHi.gain.value = mapEqCurve(this.faderHi.value);
        if(this.faderVol) this.volGain.gain.value = this.faderVol.value;

        this.eqLow.connect(this.eqMid);
        this.eqMid.connect(this.eqHi);
        this.eqHi.connect(this.filterNode);
        this.filterNode.connect(this.volGain);
        this.volGain.connect(this.masterLimiter);
        this.masterLimiter.connect(ctx.destination);

        if(this.faderFilter) this.updateFilter(this.faderFilter.value);
    }

    startNode(startTimeOffset) {
        const ctx = getAudioCtx();
        if (this.sourceNode) { try { this.sourceNode.onended = null; this.sourceNode.stop(); this.sourceNode.disconnect(); } catch(e){} }

        this.sourceNode = ctx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;

        this.sourceNode.playbackRate.value = Math.max(0.001, this.actualPlaybackRate * this.motorSpeed);
        this.sourceNode.connect(this.eqLow);

        this.pausedAt = startTimeOffset;
        this.sourceNode.start(0, this.pausedAt);
        this.lastFrameTime = performance.now() / 1000.0;
    }

    stopNode() {
        if (this.sourceNode) {
            try { this.sourceNode.onended = null; this.sourceNode.stop(); this.sourceNode.disconnect(); } catch(e){}
            this.sourceNode = null;
        }
    }

    renderLoop() {
        if(!this.ui.wrap || !this.ui.canvas || !this.ctx) return;

        let now = performance.now() / 1000.0;
        let dt = this.lastFrameTime > 0 ? (now - this.lastFrameTime) : 0;
        this.lastFrameTime = now;

        let windUpSpeed = 1.0 / Math.max(0.1, this.motorSettings.windUpSec);
        let windDownSpeed = 1.0 / Math.max(0.1, this.motorSettings.windDownSec);

        // This controls the inertia when the motor is disabled!
        if (this.motorActive && this.motorSpeed < 1.0) {
            this.motorSpeed = Math.min(1.0, this.motorSpeed + dt * windUpSpeed);
        } else if (!this.motorActive && this.motorSpeed > 0.0) {
            this.motorSpeed = Math.max(0.0, this.motorSpeed - dt * windDownSpeed);
        }

        let currentRate = this.actualPlaybackRate * this.motorSpeed;
        if (this.sourceNode) this.sourceNode.playbackRate.value = Math.max(0.001, currentRate);
        if (this.isPlaying || this.isCuePreviewing) this.pausedAt += (dt * currentRate);

        if (this.rustRenderer) {
            const dpr = window.devicePixelRatio || 1;
            const targetW = this.ui.wrap.clientWidth * dpr;
            const targetH = this.ui.wrap.clientHeight * dpr;
            if (this.ui.canvas.width !== targetW || this.ui.canvas.height !== targetH) {
                this.ui.canvas.width = targetW;
                this.ui.canvas.height = targetH;
            }

            const w = this.ui.canvas.width; const h = this.ui.canvas.height;
            this.rustRenderer.draw(this.ctx, w, h, this.pausedAt, this.baseZoomSeconds, this.cuePoint);

            let remaining = Math.max(0, this.audioBuffer.duration - this.pausedAt);
            if(this.ui.timeDisplay) this.ui.timeDisplay.innerText = formatTime(this.pausedAt) + " | -" + formatTime(remaining);
        }

        this.animFrame = requestAnimationFrame(() => this.renderLoop());
    }
}
