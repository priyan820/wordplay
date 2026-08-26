/* zip.js - a minimal zip writer and reader, store-only (no compression).
 *
 * Used for one job: getting your recorded words off a phone as a single file,
 * so they can be carried to the other phone or committed into the repo.
 *
 * No compression on purpose. The audio is already compressed - deflating it
 * again saves nothing measurable and would pull in a whole compression
 * implementation and its bugs. Storing is ~80 lines and cannot corrupt data.
 */

var ZIP = (function () {
  "use strict";

  /* --------------------------------------------------------------- crc32 -- */
  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  }());

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ------------------------------------------------------------- writing -- */

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

  /* files: [{ name: "a/b.m4a", bytes: Uint8Array }] -> Blob */
  function write(files) {
    var enc = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;

    files.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var crc = crc32(f.bytes);
      var size = f.bytes.length;

      var local = [].concat(
        u32(0x04034B50), u16(20), u16(0), u16(0),
        u16(0), u16(0),                     /* no timestamps: keeps it reproducible */
        u32(crc), u32(size), u32(size),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, f.bytes);

      central.push({
        name: nameBytes, crc: crc, size: size, offset: offset
      });
      offset += local.length + nameBytes.length + size;
    });

    var cdStart = offset;
    var cdSize = 0;
    central.forEach(function (c) {
      var head = [].concat(
        u32(0x02014B50), u16(20), u16(20), u16(0), u16(0),
        u16(0), u16(0),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(c.offset)
      );
      chunks.push(new Uint8Array(head), c.name);
      cdSize += head.length + c.name.length;
    });

    var eocd = [].concat(
      u32(0x06054B50), u16(0), u16(0),
      u16(central.length), u16(central.length),
      u32(cdSize), u32(cdStart), u16(0)
    );
    chunks.push(new Uint8Array(eocd));

    return new Blob(chunks, { type: "application/zip" });
  }

  /* ------------------------------------------------------------- reading -- */

  /* ArrayBuffer -> [{ name, bytes }]. Handles stored entries only, which is all
   * this app ever writes. A deflated entry is reported rather than mangled. */
  function read(buf) {
    var dv = new DataView(buf);
    var u8 = new Uint8Array(buf);
    var dec = new TextDecoder();

    /* Find the end-of-central-directory record, scanning back from the tail. */
    var eocd = -1;
    for (var i = buf.byteLength - 22; i >= 0 && i > buf.byteLength - 65558; i--) {
      if (dv.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not a zip file");

    var count = dv.getUint16(eocd + 10, true);
    var pos = dv.getUint32(eocd + 16, true);
    var out = [];

    for (var n = 0; n < count; n++) {
      if (dv.getUint32(pos, true) !== 0x02014B50) break;
      var method  = dv.getUint16(pos + 10, true);
      var size    = dv.getUint32(pos + 24, true);
      var nameLen = dv.getUint16(pos + 28, true);
      var extraLen= dv.getUint16(pos + 30, true);
      var cmtLen  = dv.getUint16(pos + 32, true);
      var local   = dv.getUint32(pos + 42, true);
      var name    = dec.decode(u8.subarray(pos + 46, pos + 46 + nameLen));

      if (method !== 0) throw new Error("Compressed entry not supported: " + name);

      /* Jump to the local header to find where the data actually starts. */
      var lNameLen  = dv.getUint16(local + 26, true);
      var lExtraLen = dv.getUint16(local + 28, true);
      var start = local + 30 + lNameLen + lExtraLen;

      out.push({ name: name, bytes: u8.slice(start, start + size) });
      pos += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }

  return { write: write, read: read, crc32: crc32 };
}());
