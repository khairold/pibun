/**
 * Module declarations for Electrobun's transitive dependencies.
 * Electrobun distributes raw .ts source files and imports `three`
 * for its WGPUView module. We don't use WGPU, but TypeScript still
 * processes the import.
 */
declare module "three";
