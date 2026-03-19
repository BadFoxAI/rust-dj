/* tslint:disable */
/* eslint-disable */

export class PlaylistManager {
    free(): void;
    [Symbol.dispose](): void;
    add_track(id: number, name: string): void;
    clear(): void;
    get_tracks(): any;
    constructor();
    remove_track(id: number): void;
    update_track_meta(id: number, bpm: number, key: string): void;
}

export class WaveformRenderer {
    free(): void;
    [Symbol.dispose](): void;
    draw(ctx: CanvasRenderingContext2D, w: number, h: number, current_pos: number, zoom_sec: number, cue_pos: number): void;
    get_bpm(): number;
    get_key(): string;
    constructor(samples: Float32Array, sample_rate: number);
}

export function boot_system(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_playlistmanager_free: (a: number, b: number) => void;
    readonly __wbg_waveformrenderer_free: (a: number, b: number) => void;
    readonly boot_system: () => [number, number];
    readonly playlistmanager_add_track: (a: number, b: number, c: number, d: number) => void;
    readonly playlistmanager_clear: (a: number) => void;
    readonly playlistmanager_get_tracks: (a: number) => any;
    readonly playlistmanager_new: () => number;
    readonly playlistmanager_remove_track: (a: number, b: number) => void;
    readonly playlistmanager_update_track_meta: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly waveformrenderer_draw: (a: number, b: any, c: number, d: number, e: number, f: number, g: number) => void;
    readonly waveformrenderer_get_bpm: (a: number) => number;
    readonly waveformrenderer_get_key: (a: number) => [number, number];
    readonly waveformrenderer_new: (a: number, b: number, c: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
