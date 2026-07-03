// Port of impl/Utils.java — small standalone helpers.

// Lower-case hex representation of binary data (used by sha256-hex, Stage 3).
export function printHexBinary(data) {
  let out = "";
  for (let ix = 0; ix < data.length; ix++) out += data[ix].toString(16).padStart(2, "0");
  return out;
}
