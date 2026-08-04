//! The image pipeline.
//!
//! A generated image arrives from Gemini as a PNG data URL and goes straight into the page
//! content, which is how a single section can outweigh the entire document it sits in. This
//! decodes it, fits it to the width a landing page actually renders at, flattens transparency
//! onto the page background rather than guessing white, and re-encodes it as JPEG. Metadata
//! goes with the re-encode, since nothing downstream reads it and a camera profile is bytes
//! the reader pays for.
//!
//! It is one crate rather than one per shell. Compiled to wasm it is the same implementation
//! in the desktop app, the web build and a served deployment, which is the rule the host
//! boundary exists to keep.
//!
//! The ABI is deliberately plain: bytes in, bytes out, length in the first four bytes of the
//! reply. That is the whole surface, so there is no bindgen step and no generated glue to keep
//! in sync with a toolchain.

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageEncoder, ImageReader};
use std::io::Cursor;

/// Hand the caller a buffer to write input into.
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Give a buffer back. The caller owns everything it was handed, including the reply.
///
/// # Safety
/// `ptr` and `len` must be a pair this module returned and has not already freed.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

/// Fit an image to `max_edge`, flatten it onto `bg`, and re-encode it as JPEG at `quality`.
///
/// Returns a buffer whose first four bytes are the little endian length of what follows. A
/// length of zero means the input could not be decoded, which the caller treats as a reason to
/// keep the original rather than as a failure worth showing anyone.
///
/// # Safety
/// `ptr` and `len` must describe a buffer from [`alloc`] holding `len` initialised bytes.
#[no_mangle]
pub unsafe extern "C" fn shrink(
    ptr: *mut u8,
    len: usize,
    max_edge: u32,
    quality: u32,
    bg: u32,
) -> *mut u8 {
    let input = Vec::from_raw_parts(ptr, len, len);
    let out = process(&input, max_edge, quality.clamp(1, 100) as u8, bg);
    reply(out.unwrap_or_default())
}

/// Length prefixed, because one return value is simpler to get right on both sides than a
/// pointer plus a second call asking how long it was.
fn reply(body: Vec<u8>) -> *mut u8 {
    let mut out = Vec::with_capacity(4 + body.len());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    let ptr = out.as_mut_ptr();
    std::mem::forget(out);
    ptr
}

fn process(input: &[u8], max_edge: u32, quality: u8, bg: u32) -> Option<Vec<u8>> {
    let img = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;

    // Only ever downwards. Enlarging a small image to hit a target costs bytes and adds nothing
    // a reader can see.
    let (w, h) = (img.width(), img.height());
    let img = if w.max(h) > max_edge {
        img.resize(max_edge, max_edge, FilterType::Lanczos3)
    } else {
        img
    };

    let rgb = flatten(img, bg);
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, quality)
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .ok()?;
    Some(out)
}

/// JPEG has no alpha, so transparency has to land on something. The page background is the
/// right something: white would draw a box around any figure on a dark page, which is the exact
/// look the slop detector calls out.
fn flatten(img: DynamicImage, bg: u32) -> image::RgbImage {
    let rgba = img.to_rgba8();
    let (br, bgc, bb) = (
        ((bg >> 16) & 0xff) as u16,
        ((bg >> 8) & 0xff) as u16,
        (bg & 0xff) as u16,
    );
    let mut out = image::RgbImage::new(rgba.width(), rgba.height());
    for (x, y, px) in rgba.enumerate_pixels() {
        let [r, g, b, a] = px.0;
        let a = a as u16;
        let over = |c: u8, back: u16| ((c as u16 * a + back * (255 - a)) / 255) as u8;
        out.put_pixel(x, y, image::Rgb([over(r, br), over(g, bgc), over(b, bb)]));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Detailed rather than smooth, because a gradient is the one thing PNG encodes better than
    /// JPEG and a generated illustration is never a gradient. A flat test image would prove the
    /// pipeline shrinks things when it does not.
    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut seed: u32 = 0x5eed;
        let mut img = image::RgbaImage::new(w, h);
        for p in img.pixels_mut() {
            let mut next = || {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                (seed >> 24) as u8
            };
            *p = image::Rgba([next(), next(), next(), 255]);
        }
        let mut out = Vec::new();
        DynamicImage::ImageRgba8(img)
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn it_shrinks_a_large_image_and_keeps_the_aspect() {
        let src = png(2400, 1200);
        let out = process(&src, 1400, 80, 0x0c0d10).unwrap();
        let got = image::load_from_memory(&out).unwrap();
        assert_eq!(got.width(), 1400);
        assert_eq!(got.height(), 700);
        assert!(
            out.len() * 4 < src.len(),
            "expected a large saving, got {} from {}",
            out.len(),
            src.len()
        );
    }

    #[test]
    fn it_never_enlarges() {
        let src = png(320, 200);
        let out = process(&src, 1400, 80, 0).unwrap();
        let got = image::load_from_memory(&out).unwrap();
        assert_eq!((got.width(), got.height()), (320, 200));
    }

    #[test]
    fn transparency_lands_on_the_page_background_rather_than_white() {
        let mut img = image::RgbaImage::new(8, 8);
        for p in img.pixels_mut() {
            *p = image::Rgba([255, 255, 255, 0]);
        }
        let mut src = Vec::new();
        DynamicImage::ImageRgba8(img)
            .write_to(&mut Cursor::new(&mut src), image::ImageFormat::Png)
            .unwrap();
        let out = process(&src, 1400, 92, 0x0c0d10).unwrap();
        let got = image::load_from_memory(&out).unwrap().to_rgb8();
        let px = got.get_pixel(4, 4).0;
        assert!(px[0] < 40 && px[1] < 40 && px[2] < 40, "got {px:?}");
    }

    #[test]
    fn undecodable_input_reports_nothing_rather_than_panicking() {
        assert!(process(b"not an image", 1400, 80, 0).is_none());
    }
}
