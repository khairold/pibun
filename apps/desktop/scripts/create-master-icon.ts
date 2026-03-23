#!/usr/bin/env bun
/**
 * Create a master 1024x1024 app icon PNG for PiBun.
 *
 * Uses HTML Canvas via Bun's built-in capabilities or falls back
 * to creating a simple icon using raw pixel manipulation.
 *
 * The icon design: dark rounded square with a terminal window
 * containing a stylized "π" (pi) symbol in indigo/purple.
 *
 * This generates a placeholder icon suitable for development.
 * For production, replace with a professionally designed icon.
 */

import { resolve } from "node:path";

const OUT = resolve(import.meta.dir, "../assets/icon-1024.png");

/**
 * Create an HTML file that renders the icon on a canvas and
 * provides a download. Since we can't use canvas in Bun directly,
 * we'll use sips to create a solid-color base icon.
 *
 * For a proper icon, use a design tool. This creates a recognizable
 * placeholder using macOS sips for basic shape rendering.
 */
async function main(): Promise<void> {
	// Create a simple but recognizable icon using a shell approach:
	// 1. Create a 1024x1024 solid dark background PNG
	// 2. The icon.svg in assets/ is the design reference

	// Use sips to create a blank 1024x1024 image, then we'll use
	// a different approach — write raw PNG data for a simple gradient icon.

	// Actually, let's use the tiffutil + sips approach for a solid color icon
	// as a placeholder, then note that the SVG should be used for the real icon.

	console.log("Creating master icon at:", OUT);
	console.log("Note: This creates a placeholder icon.");
	console.log("For production, convert assets/icon.svg to PNG using a design tool.");

	// Create a simple PNG using Bun's built-in image support
	// Bun doesn't have canvas, so we'll create a minimal valid PNG

	// Use system python3 to render the SVG to PNG if available
	const svgPath = resolve(import.meta.dir, "../assets/icon.svg");

	try {
		// Try using python3 with PIL/Pillow or cairosvg
		const proc = Bun.spawn(
			[
				"python3",
				"-c",
				`
import subprocess, sys

# Try cairosvg first
try:
    import cairosvg
    cairosvg.svg2png(url="${svgPath}", write_to="${OUT}", output_width=1024, output_height=1024)
    print("Generated via cairosvg")
    sys.exit(0)
except ImportError:
    pass

# Try using PIL to create a simple placeholder
try:
    from PIL import Image, ImageDraw, ImageFont
    size = 1024
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    r = 224
    draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=r, fill=(26, 26, 46, 255))

    # Terminal window
    draw.rounded_rectangle([(160, 200), (864, 760)], radius=24, fill=(15, 15, 31, 255), outline=(59, 59, 92, 255), width=3)

    # Title bar
    draw.rectangle([(160, 200), (864, 256)], fill=(26, 26, 48, 255))

    # Traffic lights
    draw.ellipse([(190, 218), (210, 238)], fill=(255, 95, 87, 255))
    draw.ellipse([(222, 218), (242, 238)], fill=(254, 188, 46, 255))
    draw.ellipse([(254, 218), (274, 238)], fill=(40, 200, 64, 255))

    # Pi symbol - try to use a font
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Times New Roman.ttf", 340)
    except:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Times.ttc", 340)
        except:
            font = ImageFont.load_default()

    # Draw pi symbol centered
    bbox = draw.textbbox((0, 0), "π", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2
    ty = 300 + (460 - th) // 2
    draw.text((tx, ty), "π", fill=(129, 140, 248, 255), font=font)

    # Cursor line
    draw.rectangle([(668, 420), (672, 700)], fill=(99, 102, 241, 180))

    # Bottom accent
    draw.rectangle([(200, 718), (400, 722)], fill=(99, 102, 241, 128))

    img.save("${OUT}", "PNG")
    print("Generated via Pillow")
    sys.exit(0)
except ImportError:
    pass

print("Neither cairosvg nor Pillow available")
sys.exit(1)
`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		if (exitCode === 0) {
			console.log(stdout.trim());
			console.log(`✅ Master icon created: ${OUT}`);
			return;
		}
		console.warn("Python render failed:", stderr.trim());
	} catch {
		console.warn("python3 not available or failed");
	}

	// Fallback: create a minimal solid-color PNG placeholder
	console.log("Creating minimal placeholder PNG...");
	await createMinimalPng();
	console.log(`✅ Placeholder icon created: ${OUT}`);
}

/**
 * Create a minimal 1024x1024 PNG with a dark indigo background.
 * This is a valid PNG that sips can resize — not pretty but functional.
 */
async function createMinimalPng(): Promise<void> {
	// Create via sips: make a 1x1 TIFF then scale up
	const tmpTiff = resolve(import.meta.dir, "../assets/tmp-icon.tiff");

	// Use sips to create from scratch — generate a 1024x1024 solid PNG
	// We'll use a roundabout but reliable method:
	// 1. Create a small RGBA raw data file
	// 2. Convert with sips

	// Actually, simplest: copy a reference icon and recolor
	// Or: write raw RGBA data and use sips to convert

	// Write raw RGBA pixel data (1024x1024 × 4 bytes = 4MB)
	const size = 1024;
	const pixels = new Uint8Array(size * size * 4);

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4;

			// Check if inside rounded rect (radius = 224)
			const r = 224;
			const inRoundedRect = isInsideRoundedRect(x, y, 0, 0, size, size, r);

			if (inRoundedRect) {
				// Gradient from top-left to bottom-right
				const t = (x + y) / (2 * size);
				pixels[i] = Math.round(26 * (1 - t) + 13 * t); // R
				pixels[i + 1] = Math.round(26 * (1 - t) + 13 * t); // G
				pixels[i + 2] = Math.round(46 * (1 - t) + 26 * t); // B
				pixels[i + 3] = 255; // A

				// Draw "π" region — simplified as a colored rectangle area
				if (x >= 350 && x <= 674 && y >= 320 && y <= 680) {
					const cx = 512;
					const cy = 500;
					const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
					if (dist < 200) {
						const intensity = 1 - dist / 200;
						pixels[i] = Math.round(99 + 30 * intensity);
						pixels[i + 1] = Math.round(102 + 38 * intensity);
						pixels[i + 2] = Math.round(241 + 7 * intensity);
					}
				}
			} else {
				// Transparent
				pixels[i] = 0;
				pixels[i + 1] = 0;
				pixels[i + 2] = 0;
				pixels[i + 3] = 0;
			}
		}
	}

	// Write as raw RGBA, then convert with sips
	const rawPath = resolve(import.meta.dir, "../assets/tmp-raw.rgba");
	await Bun.write(rawPath, pixels);

	// Unfortunately sips can't read raw RGBA. Use a different approach.
	// Write a minimal BMP file instead.
	await writeBmpFile(OUT.replace(".png", ".bmp"), pixels, size, size);

	// Convert BMP to PNG with sips
	const bmpPath = OUT.replace(".png", ".bmp");
	const proc = Bun.spawn(["sips", "-s", "format", "png", bmpPath, "--out", OUT], {
		stdout: "pipe",
		stderr: "pipe",
	});
	await proc.exited;

	// Clean up temp files
	const { unlinkSync } = await import("node:fs");
	try {
		unlinkSync(rawPath);
	} catch {}
	try {
		unlinkSync(bmpPath);
	} catch {}
}

function isInsideRoundedRect(
	x: number,
	y: number,
	rx: number,
	ry: number,
	rw: number,
	rh: number,
	radius: number,
): boolean {
	// Check corners
	const corners = [
		{ cx: rx + radius, cy: ry + radius }, // top-left
		{ cx: rx + rw - radius, cy: ry + radius }, // top-right
		{ cx: rx + radius, cy: ry + rh - radius }, // bottom-left
		{ cx: rx + rw - radius, cy: ry + rh - radius }, // bottom-right
	];

	for (const corner of corners) {
		const dx = Math.abs(x - corner.cx);
		const dy = Math.abs(y - corner.cy);
		// Only check if we're in the corner region
		if (
			(x < corner.cx === corner.cx) === rx + radius &&
			(y < corner.cy === corner.cy) === ry + radius
		) {
			continue;
		}
	}

	// Simplified: just check if in the corner exclusion zone
	if (x < rx + radius && y < ry + radius) {
		const dist = Math.sqrt((x - (rx + radius)) ** 2 + (y - (ry + radius)) ** 2);
		return dist <= radius;
	}
	if (x > rx + rw - radius && y < ry + radius) {
		const dist = Math.sqrt((x - (rx + rw - radius)) ** 2 + (y - (ry + radius)) ** 2);
		return dist <= radius;
	}
	if (x < rx + radius && y > ry + rh - radius) {
		const dist = Math.sqrt((x - (rx + radius)) ** 2 + (y - (ry + rh - radius)) ** 2);
		return dist <= radius;
	}
	if (x > rx + rw - radius && y > ry + rh - radius) {
		const dist = Math.sqrt((x - (rx + rw - radius)) ** 2 + (y - (ry + rh - radius)) ** 2);
		return dist <= radius;
	}

	return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
}

/** Write a 32-bit BGRA BMP file (bottom-up, uncompressed). */
async function writeBmpFile(
	path: string,
	rgbaPixels: Uint8Array,
	width: number,
	height: number,
): Promise<void> {
	const headerSize = 14;
	const infoHeaderSize = 108; // BITMAPV4HEADER for alpha support
	const pixelDataSize = width * height * 4;
	const fileSize = headerSize + infoHeaderSize + pixelDataSize;

	const buf = new ArrayBuffer(fileSize);
	const view = new DataView(buf);
	const u8 = new Uint8Array(buf);

	// BMP Header (14 bytes)
	u8[0] = 0x42;
	u8[1] = 0x4d; // "BM"
	view.setUint32(2, fileSize, true);
	view.setUint32(10, headerSize + infoHeaderSize, true);

	// BITMAPV4HEADER (108 bytes)
	view.setUint32(14, infoHeaderSize, true);
	view.setInt32(18, width, true);
	view.setInt32(22, -height, true); // negative = top-down
	view.setUint16(26, 1, true); // planes
	view.setUint16(28, 32, true); // bits per pixel
	view.setUint32(30, 3, true); // BI_BITFIELDS compression
	view.setUint32(34, pixelDataSize, true);
	view.setUint32(38, 2835, true); // X pixels per meter
	view.setUint32(42, 2835, true); // Y pixels per meter

	// RGBA bit masks for BI_BITFIELDS
	view.setUint32(54, 0x00ff0000, true); // Red mask
	view.setUint32(58, 0x0000ff00, true); // Green mask
	view.setUint32(62, 0x000000ff, true); // Blue mask
	view.setUint32(66, 0xff000000, true); // Alpha mask

	// Color space type (LCS_sRGB)
	view.setUint32(70, 0x73524742, true); // 'sRGB'

	// Pixel data (BGRA format, top-down due to negative height)
	const dataOffset = headerSize + infoHeaderSize;
	for (let i = 0; i < width * height; i++) {
		const srcIdx = i * 4;
		const dstIdx = dataOffset + i * 4;
		u8[dstIdx] = rgbaPixels[srcIdx + 2] ?? 0; // B
		u8[dstIdx + 1] = rgbaPixels[srcIdx + 1] ?? 0; // G
		u8[dstIdx + 2] = rgbaPixels[srcIdx] ?? 0; // R
		u8[dstIdx + 3] = rgbaPixels[srcIdx + 3] ?? 0; // A
	}

	await Bun.write(path, new Uint8Array(buf));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
