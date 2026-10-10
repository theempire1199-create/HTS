// Android 11+ blocks apps from reading network-interface details (MAC addresses),
// so Node's os.networkInterfaces() throws ERR_SYSTEM_ERROR (errno 13). Vite calls
// it to print the LAN URLs, which crashes `vite --host` on Android/Termux.
// This guard makes the call return {} instead of crashing. Harmless elsewhere.
const os = require('node:os')
const original = os.networkInterfaces
os.networkInterfaces = function patched() {
  try {
    return original.call(this)
  } catch {
    return {}
  }
}
