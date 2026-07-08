import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEX32 = /^[0-9a-fA-F]{64}$/;

// Extracts the 32-byte ed25519 seed hex for the camera's hardware identity
// (hardware-camera-app/hardware_identity.py). Mirrors that module's
// derivation as a last-resort fallback: seed = sha256(hw_id_string + salt).
class HardwareKeyExtractor {
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.hardwareIdentityPath = path.join(__dirname, '../hardware-camera-app/hardware_identity.py');
    this.exportFile = path.join(__dirname, '../hardware-camera-app/.device_key_export');
    this.cacheFile = path.join(__dirname, '.hardware_key_cache');
  }

  /**
   * Returns the 32-byte ed25519 seed as a 64-char hex string, or null.
   */
  getSeedHex(cameraId = null) {
    try {
      const exported = this._tryReadFromExportFile();
      if (exported) return exported;

      if (fs.existsSync(this.cacheFile)) {
        try {
          const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
          if (cached.seedHex && HEX32.test(cached.seedHex) && Date.now() - cached.timestamp < 3600000) {
            console.log('✅ Using cached hardware key');
            return cached.seedHex;
          }
        } catch (e) {
          // ignore corrupt cache
        }
      }

      if (!cameraId) {
        cameraId = this._cameraIdFromExportFile();
      }

      const exportScript = path.join(__dirname, '../hardware-camera-app/export_key.py');
      if (fs.existsSync(exportScript)) {
        try {
          execSync(`${this.pythonPath} ${exportScript}${cameraId ? ` ${cameraId}` : ''}`, {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            timeout: 10000,
            stdio: 'pipe',
          });

          const exportedAfter = this._tryReadFromExportFile();
          if (exportedAfter) return exportedAfter;
        } catch (e) {
          console.log('Export script failed, trying direct call...');
        }
      }

      const direct = this._getSeedHexViaPython(cameraId);
      if (direct) return direct;

      console.warn('⚠️ Could not obtain hardware seed via export file or Python; using local derivation fallback');
      return this._deriveSeedFallback(cameraId);
    } catch (error) {
      console.error('❌ Error extracting hardware key:', error.message);
      return this._tryReadFromExportFile();
    }
  }

  _getSeedHexViaPython(cameraId) {
    const pythonScript = `
import sys
import json
sys.path.insert(0, '${path.join(__dirname, '../hardware-camera-app').replace(/\\/g, '/')}')

try:
    from hardware_identity import get_hardware_identity

    camera_id = ${cameraId ? JSON.stringify(cameraId) : 'None'}
    hw_id = get_hardware_identity(camera_id=camera_id)

    result = {
        'success': True,
        'seedHex': hw_id.get_seed_hex(),
        'address': hw_id.get_address(),
        'cameraId': hw_id.get_camera_id()
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
    sys.exit(1)
`;

    const tempScript = path.join(__dirname, '.temp_get_key.py');
    fs.writeFileSync(tempScript, pythonScript, 'utf8');

    try {
      const output = execSync(`${this.pythonPath} ${tempScript}`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 10000,
        stdio: 'pipe',
      });

      const result = JSON.parse(output.trim());
      if (result.success && result.seedHex) {
        fs.writeFileSync(
          this.cacheFile,
          JSON.stringify({
            seedHex: result.seedHex,
            address: result.address,
            cameraId: result.cameraId,
            timestamp: Date.now(),
          }),
          'utf8'
        );
        console.log(`✅ Hardware key extracted: ${result.address}`);
        return result.seedHex;
      }
      return null;
    } catch (e) {
      return null;
    } finally {
      if (fs.existsSync(tempScript)) {
        try {
          fs.unlinkSync(tempScript);
        } catch (_) {
          // ignore
        }
      }
    }
  }

  _tryReadFromExportFile() {
    if (fs.existsSync(this.exportFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.exportFile, 'utf8'));
        if (data.seed_hex && HEX32.test(data.seed_hex)) {
          console.log('✅ Read hardware key from export file');
          console.log(`   📍 Address from export: ${data.address}`);
          console.log(`   📷 Camera ID from export: ${data.cameraId || 'none'}`);

          fs.writeFileSync(
            this.cacheFile,
            JSON.stringify({
              seedHex: data.seed_hex,
              address: data.address,
              cameraId: data.cameraId,
              timestamp: Date.now(),
            }),
            'utf8'
          );

          return data.seed_hex;
        }
        console.warn('   ⚠️ Export file exists but has no valid seed_hex');
      } catch (e) {
        console.error('   ❌ Error reading export file:', e.message);
      }
    } else {
      console.log(`   ℹ️ Export file not found: ${this.exportFile}`);
      console.log(`   ℹ️ Camera app will create it on startup`);
    }

    return null;
  }

  _cameraIdFromExportFile() {
    try {
      if (fs.existsSync(this.exportFile)) {
        const data = JSON.parse(fs.readFileSync(this.exportFile, 'utf8'));
        return data.cameraId || null;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  /**
   * Local mirror of hardware_identity.py's `_derive_key` when neither the
   * export file nor a Python subprocess call is available. Off the actual
   * Raspberry Pi this will rarely produce the real device key (no CPU
   * serial / MAC / machine-id to read), but it keeps the derivation
   * algorithm identical: seed = sha256(hw_id_string + salt).
   */
  _deriveSeedFallback(cameraId) {
    const identifiers = [];

    if (cameraId) {
      identifiers.push(`camera:${cameraId}`);
    }

    try {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const serialLine = cpuinfo.split('\n').find((l) => l.includes('Serial'));
      if (serialLine) {
        const serial = serialLine.split(':')[1]?.trim();
        if (serial) identifiers.push(`serial:${serial}`);
      }
    } catch (_) {
      // not on Linux / no cpuinfo — expected off-Pi
    }

    for (const iface of ['wlan0', 'eth0']) {
      try {
        const macPath = `/sys/class/net/${iface}/address`;
        if (fs.existsSync(macPath)) {
          const mac = fs.readFileSync(macPath, 'utf8').trim();
          identifiers.push(`mac:${mac}`);
          break;
        }
      } catch (_) {
        // ignore
      }
    }

    try {
      if (fs.existsSync('/etc/machine-id')) {
        const machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
        identifiers.push(`machine:${machineId}`);
      }
    } catch (_) {
      // ignore
    }

    if (identifiers.length === 0) {
      console.warn('⚠️ No hardware identifiers available for local seed derivation fallback');
      return null;
    }

    const saltPath = process.env.SALT_PATH || '/boot/.device_salt';
    const saltBackupPath =
      process.env.SALT_BACKUP_PATH || path.join(os.homedir(), '.lensmint', '.device_salt_backup');

    let salt = null;
    for (const candidate of [saltPath, saltBackupPath]) {
      try {
        if (candidate && fs.existsSync(candidate)) {
          const buf = fs.readFileSync(candidate);
          if (buf.length === 32) {
            salt = buf;
            break;
          }
        }
      } catch (_) {
        // ignore
      }
    }

    if (!salt) {
      console.warn('⚠️ No device salt available for local seed derivation fallback');
      return null;
    }

    const hwIdBuffer = Buffer.from(identifiers.join('|'), 'utf8');
    const seed = crypto.createHash('sha256').update(Buffer.concat([hwIdBuffer, salt])).digest();
    return seed.toString('hex');
  }

  getDeviceAddress() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        return cached.address || null;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  clearCache() {
    if (fs.existsSync(this.cacheFile)) {
      fs.unlinkSync(this.cacheFile);
    }
  }
}

const hardwareKeyExtractor = new HardwareKeyExtractor();

export default hardwareKeyExtractor;
