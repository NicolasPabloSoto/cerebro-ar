// @ts-check

/**
 * Módulo de Observabilidad Móvil (Logger / Consola en Pantalla)
 * Captura logs, errores y métricas en tiempo real y permite copiarlos desde el dispositivo móvil.
 */
class MobileLogger {
  constructor() {
    /** @type {string[]} */
    this.logs = [];
    this.maxLogs = 200;
    this.container = null;
    this.hudElement = null;
    this.logListElement = null;
    this.isCollapsed = false;
    this.initUI();
    this.interceptConsole();
  }

  initUI() {
    if (typeof document === 'undefined') return;

    // Contenedor principal de la consola flotante
    this.container = document.createElement('div');
    this.container.id = 'mobile-logger-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      right: 10px;
      max-height: 40vh;
      background: rgba(10, 15, 25, 0.88);
      color: #00ffcc;
      font-family: monospace;
      font-size: 11px;
      border: 1px solid rgba(0, 255, 204, 0.4);
      border-radius: 8px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
      overflow: hidden;
    `;

    // Barra de herramientas superior (HUD + Botones)
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 6px 10px;
      background: rgba(0, 255, 204, 0.15);
      border-bottom: 1px solid rgba(0, 255, 204, 0.3);
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    `;

    this.hudElement = document.createElement('div');
    this.hudElement.style.cssText = `font-weight: bold; font-size: 11px; color: #ffffff;`;
    this.hudElement.innerText = `CerebroAR | FPS: -- | Caras: 0 | Conf: 0%`;

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `display: flex; gap: 6px;`;

    // Botón Copiar Logs
    const copyBtn = document.createElement('button');
    copyBtn.innerText = '📋 Copiar';
    copyBtn.style.cssText = `
      background: #00ffcc;
      color: #000;
      border: none;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 10px;
      cursor: pointer;
    `;
    copyBtn.onclick = () => this.copyToClipboard(copyBtn);

    // Botón Minimiizar/Expandir
    const toggleBtn = document.createElement('button');
    toggleBtn.innerText = '▼';
    toggleBtn.style.cssText = `
      background: rgba(255,255,255,0.2);
      color: #fff;
      border: none;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
    `;
    toggleBtn.onclick = () => {
      this.isCollapsed = !this.isCollapsed;
      this.logListElement.style.display = this.isCollapsed ? 'none' : 'block';
      toggleBtn.innerText = this.isCollapsed ? '▲' : '▼';
    };

    buttonGroup.appendChild(copyBtn);
    buttonGroup.appendChild(toggleBtn);
    header.appendChild(this.hudElement);
    header.appendChild(buttonGroup);

    // Lista de logs
    this.logListElement = document.createElement('div');
    this.logListElement.style.cssText = `
      padding: 8px;
      overflow-y: auto;
      flex-grow: 1;
      max-height: 250px;
      word-break: break-all;
      white-space: pre-wrap;
    `;

    this.container.appendChild(header);
    this.container.appendChild(this.logListElement);

    if (document.body) {
      document.body.appendChild(this.container);
    } else {
      window.addEventListener('DOMContentLoaded', () => document.body.appendChild(this.container));
    }
  }

  interceptConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog.apply(console, args);
      this.addLog('INFO', args);
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      this.addLog('WARN', args);
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      this.addLog('ERROR', args);
    };

    window.addEventListener('error', (e) => {
      this.addLog('UNCAUGHT', [e.message, `${e.filename}:${e.lineno}`]);
    });

    window.addEventListener('unhandledrejection', (e) => {
      this.addLog('PROMISE', [e.reason]);
    });
  }

  /**
   * @param {'INFO' | 'WARN' | 'ERROR' | 'UNCAUGHT' | 'PROMISE'} type 
   * @param {any[]} args 
   */
  addLog(type, args) {
    const time = new Date().toISOString().split('T')[1].slice(0, 8);
    const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const logLine = `[${time}] [${type}] ${message}`;

    this.logs.push(logLine);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.logListElement) {
      const entry = document.createElement('div');
      entry.style.cssText = `margin-bottom: 3px; font-size: 10.5px; border-bottom: 1px solid rgba(255,255,255,0.05);`;
      
      if (type === 'ERROR' || type === 'UNCAUGHT' || type === 'PROMISE') {
        entry.style.color = '#ff5555';
      } else if (type === 'WARN') {
        entry.style.color = '#ffcc00';
      } else {
        entry.style.color = '#00ffcc';
      }

      entry.innerText = logLine;
      this.logListElement.appendChild(entry);
      this.logListElement.scrollTop = this.logListElement.scrollHeight;
    }
  }

  /**
   * Actualiza el HUD superior en pantalla
   * @param {{ fps?: number, faces?: number, confidence?: number, state?: string }} metrics 
   */
  updateHUD({ fps, faces, confidence, state }) {
    if (!this.hudElement) return;
    const fpsStr = fps !== undefined ? fps.toFixed(0) : '--';
    const facesStr = faces !== undefined ? faces : 0;
    const confStr = confidence !== undefined ? (confidence * 100).toFixed(0) + '%' : '0%';
    const stateStr = state ? ` | ${state}` : '';
    this.hudElement.innerText = `FPS: ${fpsStr} | Caras: ${facesStr} | Conf: ${confStr}${stateStr}`;
  }

  /**
   * Copia todo el historial de logs al portapapeles
   * @param {HTMLButtonElement} btn 
   */
  copyToClipboard(btn) {
    const fullText = this.logs.join('\n');
    navigator.clipboard.writeText(fullText).then(() => {
      const origText = btn.innerText;
      btn.innerText = '✅ ¡Copiado!';
      btn.style.background = '#00ff66';
      setTimeout(() => {
        btn.innerText = origText;
        btn.style.background = '#00ffcc';
      }, 2000);
    }).catch(err => {
      console.error('Error al copiar logs:', err);
    });
  }
}

export const Logger = new MobileLogger();
