/* tslint:disable */
/* eslint-disable */

/**
 * A document read and laid out once; its pages are rasterised one at a time.
 */
export class Doc {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Read `docx` and lay it out in Print view. Nothing is rasterised yet.
     */
    constructor(docx: Uint8Array);
    /**
     * Every page's size in points: width, height, width, height, …
     */
    page_sizes(): Float32Array;
    /**
     * Page `index` (from 0) as PNG bytes at `scale` pixels per point.
     */
    render_page(index: number, scale: number): Uint8Array;
}

/**
 * Every page of `docx` as PNG bytes, rendered at `scale` pixels per point.
 */
export function render_docx(docx: Uint8Array, scale: number): Array<any>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_doc_free: (a: number, b: number) => void;
    readonly doc_new: (a: number, b: number) => [number, number, number];
    readonly doc_page_sizes: (a: number) => [number, number];
    readonly doc_render_page: (a: number, b: number, c: number) => [number, number, number, number];
    readonly render_docx: (a: number, b: number, c: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
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
