'use strict';

// ═══════════════════════════════════════════════
// 局域网联机模块 — UDP 发现 + HTTP 传输（零依赖）
// ═══════════════════════════════════════════════

const dgram = require('dgram');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const PET_PORT = 19826;        // HTTP 服务端口（接收桌宠）
const DISCOVER_PORT = 19827;   // UDP 广播端口（发现 peer）
const BROADCAST_INTERVAL = 3000;
const PEER_TIMEOUT = 10000;

class LanManager {
  constructor() {
    this.id = crypto.randomBytes(4).toString('hex');
    this.name = os.hostname() || 'Unknown';
    this.peers = new Map();     // id -> { id, name, ip, port, lastSeen }
    this.httpServer = null;
    this.udpSocket = null;
    this.broadcastTimer = null;
    this.onPeersChanged = null;
    this.onPetReceived = null;
    this.onSendResult = null;
    this.actualPort = PET_PORT;  // 实际监听端口（端口冲突时可能变化）
    this.started = false;
  }

  // 获取本机所有非内网 IPv4 地址
  getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  }

  // 获取子网广播地址列表（计算真实子网广播地址，结合全局 255.255.255.255）
  getBroadcastAddresses() {
    const interfaces = os.networkInterfaces();
    const addrs = new Set();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address) {
          if (iface.netmask) {
            const ipParts = iface.address.split('.').map(Number);
            const maskParts = iface.netmask.split('.').map(Number);
            if (ipParts.length === 4 && maskParts.length === 4) {
              const bcast = [];
              for (let i = 0; i < 4; i++) {
                bcast.push((ipParts[i] & maskParts[i]) | (~maskParts[i] & 255));
              }
              addrs.add(bcast.join('.'));
              continue;
            }
          }
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            addrs.add(parts.slice(0, 3).join('.') + '.255');
          }
        }
      }
    }
    addrs.add('255.255.255.255');
    return Array.from(addrs);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this._startHttpServer();
    this._startUdpDiscovery();
    console.log(`[LAN] Started. id=${this.id} name=${this.name} ips=[${this.getLocalIPs().join(', ')}]`);
  }

  // ── HTTP 服务器：接收飞来的桌宠 ──
  _startHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      // 心跳/探测
      if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: this.id, name: this.name }));
        return;
      }

      // 接收桌宠（含 64KB 大小限制与格式校验）
      if (req.method === 'POST' && req.url === '/receive-pet') {
        let body = '';
        let tooLarge = false;
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 65536) {
            tooLarge = true;
            req.destroy();
          }
        });
        req.on('end', () => {
          if (tooLarge) return;
          try {
            const raw = JSON.parse(body);
            if (!raw || typeof raw !== 'object') throw new Error('Invalid payload');
            const state = {
              character: typeof raw.character === 'string' ? raw.character.slice(0, 32) : 'slime',
              skin: typeof raw.skin === 'string' ? raw.skin.slice(0, 32) : 'default',
              emotion: typeof raw.emotion === 'string' ? raw.emotion.slice(0, 32) : 'happy',
              mood: Number.isFinite(raw.mood) ? Math.max(0, Math.min(100, raw.mood)) : 80,
              energy: Number.isFinite(raw.energy) ? Math.max(0, Math.min(100, raw.energy)) : 80,
              senderName: typeof raw.senderName === 'string' ? raw.senderName.slice(0, 64) : 'unknown',
              vx: Number.isFinite(raw.vx) ? raw.vx : 0,
              vy: Number.isFinite(raw.vy) ? raw.vy : 0,
            };
            console.log(`[LAN] Received pet from ${state.senderName}`);
            if (this.onPetReceived) this.onPetReceived(state);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            console.error('[LAN] Parse error:', e.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    this.httpServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        // 端口冲突：依次尝试 PET_PORT+1, +2, +3
        const tryPort = (offset) => {
          if (offset > 3) {
            console.error('[LAN] All HTTP ports in use, giving up');
            return;
          }
          const p = PET_PORT + offset;
          const tmp = http.createServer();
          tmp.on('error', () => tryPort(offset + 1));
          tmp.listen(p, '0.0.0.0', () => {
            tmp.close(() => {
              // 端口可用，重启正式 server
              this.httpServer.listen(p, '0.0.0.0', () => {
                this.actualPort = p;
                console.log(`[LAN] HTTP server listening on :${p} (fallback)`);
              });
            });
          });
        };
        console.error(`[LAN] Port ${PET_PORT} in use, trying fallback`);
        tryPort(1);
      } else {
        console.error('[LAN] HTTP error:', e.message);
      }
    });

    this.httpServer.listen(PET_PORT, '0.0.0.0', () => {
      this.actualPort = PET_PORT;
      console.log(`[LAN] HTTP server listening on :${PET_PORT}`);
    });
  }

  // ── UDP 发现：广播自己 + 监听他人 ──
  _startUdpDiscovery() {
    this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.udpSocket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.id === this.id) return; // 忽略自己

        const wasNew = !this.peers.has(data.id);
        const prev = this.peers.get(data.id);
        this.peers.set(data.id, {
          id: data.id,
          name: data.name,
          ip: rinfo.address,
          port: data.port,
          lastSeen: Date.now()
        });

        if (wasNew) {
          console.log(`[LAN] Peer discovered: ${data.name} @ ${rinfo.address}:${data.port}`);
          if (this.onPeersChanged) this.onPeersChanged(this.getPeers(), 'add', this.peers.get(data.id));
        } else if (prev && prev.port !== data.port) {
          // peer 端口变了
          console.log(`[LAN] Peer port updated: ${data.name} ${prev.port} -> ${data.port}`);
          if (this.onPeersChanged) this.onPeersChanged(this.getPeers(), 'update', this.peers.get(data.id));
        }
      } catch (e) { /* ignore malformed */ }
    });

    this.udpSocket.on('error', (e) => {
      console.error('[LAN] UDP error:', e.message);
    });

    this.udpSocket.bind(DISCOVER_PORT, () => {
      this.udpSocket.setBroadcast(true);
      // 定期广播 + 清理过期 peer
      this.broadcastTimer = setInterval(() => {
        this._broadcast();
        this._cleanupPeers();
      }, BROADCAST_INTERVAL);
      this._broadcast(); // 立即广播一次
    });
  }

  _broadcast() {
    // 关键：广播要带 actualPort（端口冲突后会变化）
    const msg = JSON.stringify({
      id: this.id,
      name: this.name,
      port: this.actualPort,
      ts: Date.now()
    });
    const buf = Buffer.from(msg);

    // 1. 255.255.255.255 全局广播（部分路由器会丢弃）
    this.udpSocket.send(buf, 0, buf.length, DISCOVER_PORT, '255.255.255.255', (err) => {
      if (err) console.error('[LAN] Broadcast error:', err.message);
    });

    // 2. 子网定向广播（更可靠，路由器一般不会丢弃）
    for (const subnet of this.getBroadcastAddresses()) {
      this.udpSocket.send(buf, 0, buf.length, DISCOVER_PORT, subnet);
    }
  }

  _cleanupPeers() {
    const now = Date.now();
    let removed = [];
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        this.peers.delete(id);
        removed.push(peer);
      }
    }
    if (removed.length > 0 && this.onPeersChanged) {
      console.log(`[LAN] Peers expired: ${removed.map(p => p.name).join(', ')}`);
      this.onPeersChanged(this.getPeers(), 'remove', removed);
    }
  }

  getPeers() {
    return Array.from(this.peers.values()).map(p => ({
      id: p.id,
      name: p.name,
      ip: p.ip,
      port: p.port
    }));
  }

  // ── 发送桌宠到指定 peer（带一次自动重试）──
  async sendPet(peerIp, peerPort, petState) {
    const payload = JSON.stringify({
      ...petState,
      senderId: this.id,
      senderName: this.name,
      ts: Date.now()
    });

    const doSend = (port) => new Promise((resolve, reject) => {
      const req = http.request({
        hostname: peerIp,
        port: port,
        path: '/receive-pet',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 5000
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`[LAN] Pet sent to ${peerIp}:${port}`);
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (e) => {
        console.error(`[LAN] Send error to ${peerIp}:${port}:`, e.message);
        reject(e);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });

      req.write(payload);
      req.end();
    });

    try {
      return await doSend(peerPort);
    } catch (e) {
      // 第一次失败：重试一次（可能是端口冲突导致对方端口变化）
      console.warn(`[LAN] First send failed (${e.message}), retrying once...`);
      try {
        // 尝试 ping 获取对方真实端口
        const realPort = await this._probeRealPort(peerIp, peerPort);
        if (realPort && realPort !== peerPort) {
          console.log(`[LAN] Peer real port is ${realPort}, retrying...`);
          return await doSend(realPort);
        }
        // 拿不到端口，直接重试原端口
        return await doSend(peerPort);
      } catch (e2) {
        throw e2;
      }
    }
  }

  // ── 探测 peer 真实端口（ping 失败则返回原端口） ──
  _probeRealPort(peerIp, peerPort) {
    return new Promise((resolve) => {
      const tryPort = (port) => {
        const req = http.request({
          hostname: peerIp,
          port: port,
          path: '/ping',
          method: 'GET',
          timeout: 2000
        }, (res) => {
          let body = '';
          res.on('data', chunk => { body += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const info = JSON.parse(body);
                if (info.id) { resolve(port); return; }
              } catch (e) {}
            }
            resolve(null);
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
      };
      tryPort(peerPort);
      // 同时尝试 fallback 端口
      setTimeout(() => tryPort(peerPort + 1), 100);
      setTimeout(() => tryPort(peerPort + 2), 200);
      setTimeout(() => tryPort(peerPort + 3), 300);
    });
  }

  stop() {
    this.started = false;
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    if (this.udpSocket) {
      try { this.udpSocket.close(); } catch (e) {}
      this.udpSocket = null;
    }
    if (this.httpServer) {
      try { this.httpServer.close(); } catch (e) {}
      this.httpServer = null;
    }
  }
}

module.exports = LanManager;
