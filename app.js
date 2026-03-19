import init, { boot_system, PlaylistManager } from './pkg/rust_dj.js';
import { TrackDB, Player } from './engine.js';

window.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); return false; });

const radiosReset = document.getElementsByName('reset-mode');
const rowEaseTime = document.getElementById('row-ease-time');
const rEaseTime = document.getElementById('rng-ease-time');
const lEaseTime = document.getElementById('lbl-ease-time');

const tTempo = document.getElementById('toggle-tempo');
const tMotor = document.getElementById('toggle-motor');
const rWindDown = document.getElementById('rng-wind-down');
const rWindUp = document.getElementById('rng-wind-up');
const lWindDown = document.getElementById('lbl-wind-down');
const lWindUp = document.getElementById('lbl-wind-up');

let motorSettings = { windDownSec: 1.5, windUpSec: 1.0 };
let resetState = { mode: 'ease', easeTimeMs: 200 };

function applyResetMode() {
    let val = 'off';
    radiosReset.forEach(r => { if(r.checked) val = r.value; });
    resetState.mode = val;
    rowEaseTime.style.display = (resetState.mode === 'ease') ? 'flex' : 'none';
    document.querySelectorAll('.clickable-label').forEach(lbl => {
        if (resetState.mode === 'off') lbl.classList.remove('reset-active');
        else lbl.classList.add('reset-active');
    });
}
radiosReset.forEach(r => r.addEventListener('change', applyResetMode));
rEaseTime.addEventListener('input', (e) => { resetState.easeTimeMs = parseInt(e.target.value); lEaseTime.innerText = resetState.easeTimeMs; });
applyResetMode();

tTempo.addEventListener('change', (e) => document.body.classList.toggle('hide-tempo', !e.target.checked));
tMotor.addEventListener('change', (e) => document.body.classList.toggle('hide-motor', !e.target.checked));

rWindDown.addEventListener('input', (e) => { motorSettings.windDownSec = parseFloat(e.target.value); lWindDown.innerText = motorSettings.windDownSec.toFixed(1); });
rWindUp.addEventListener('input', (e) => { motorSettings.windUpSec = parseFloat(e.target.value); lWindUp.innerText = motorSettings.windUpSec.toFixed(1); });

const tabs = [
    { btn: 'tab-player', view: 'view-player' },
    { btn: 'tab-dual', view: 'view-dual' },
    { btn: 'tab-playlist', view: 'view-playlist' },
    { btn: 'tab-sys', view: 'view-sys' }
];
tabs.forEach(tab => {
    document.getElementById(tab.btn).addEventListener('pointerdown', () => {
        tabs.forEach(t => {
            document.getElementById(t.btn).classList.remove('active');
            document.getElementById(t.view).classList.remove('active');
        });
        document.getElementById(tab.btn).classList.add('active');
        document.getElementById(tab.view).classList.add('active');
        window.dispatchEvent(new Event('resize'));
    });
});

async function run() {
    await init();
    try { boot_system(); } catch(e) { console.error("Kernel Error:", e); }

    const getResetState = () => resetState;
    const rustPlaylist = new PlaylistManager();
    const trackDB = new TrackDB(refreshPlaylistUI);

    const onMetaUpdate = (id, bpm, key) => {
        rustPlaylist.update_track_meta(id, bpm, key);
        refreshPlaylistUI();
    };

    const pSingle = new Player('s1-', motorSettings, getResetState, onMetaUpdate);
    const pDualA = new Player('da-', motorSettings, getResetState, onMetaUpdate);
    const pDualB = new Player('db-', motorSettings, getResetState, onMetaUpdate);

    const fileInput = document.getElementById('file-input-real');

    document.getElementById('btn-add-tracks').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            document.getElementById('btn-add-tracks').innerText = 'IMPORTING...';
            for(let i=0; i<files.length; i++) {
                let file = files[i];
                let id = await trackDB.addFile(file);
                rustPlaylist.add_track(id, file.name);
            }
            refreshPlaylistUI();
            document.getElementById('btn-add-tracks').innerText = '+ ADD FILES';
        }
    });

    document.getElementById('btn-wipe').addEventListener('pointerdown', () => {
        if (confirm("Clear local library?")) {
            rustPlaylist.clear(); trackDB.wipeDrive(); refreshPlaylistUI();
        }
    });

    async function refreshPlaylistUI() {
        const tracks = rustPlaylist.get_tracks();
        const listDiv = document.getElementById('track-list');
        listDiv.innerHTML = '';
        tracks.forEach(t => {
            const el = document.createElement('div');
            el.className = 'track-item';

            let metaHtml = '';
            if (t.bpm && t.bpm > 0) {
                metaHtml = `<div class="track-item-meta"><span class="meta-badge meta-key">${t.key}</span><span class="meta-badge meta-bpm">${t.bpm.toFixed(1)}</span></div>`;
            }

            el.innerHTML = `
                <div class="track-info-col">
                    <div class="track-item-title">${t.name}</div>
                    ${metaHtml}
                </div>
                <button class="btn-delete" data-id="${t.id}">🗑️</button>
            `;
            listDiv.appendChild(el);
        });
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                let id = parseInt(e.target.dataset.id);
                rustPlaylist.remove_track(id); trackDB.deleteFile(id); refreshPlaylistUI();
            });
        });

        // Push Library to the Hardware Browsers
        pSingle.refreshPlaylistData(tracks, trackDB);
        pDualA.refreshPlaylistData(tracks, trackDB);
        pDualB.refreshPlaylistData(tracks, trackDB);
    }
}
run();