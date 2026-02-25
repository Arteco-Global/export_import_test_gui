import { useEffect } from "react";
import initLegacyApp from "./legacyApp";
import "./styles.css";

function App() {
  useEffect(() => {
    initLegacyApp();
  }, []);

  return (
    <main className="app">
      <header className="header">
        <h1>Import / Export</h1>
        <p>Login su Arteco Global, selezione sito per seriale e operazioni sul server selezionato.</p>
      </header>

      <section className="workspace">
        <aside className="card sidebar hidden" id="sitesSection">
          <h2>Siti Arteco</h2>
          <p>Elenco siti disponibili (seriale). Clicca per fare login al server.</p>
          <div id="siteList" className="site-list">
            <div className="placeholder">Fai login ad Arteco Global per caricare i siti.</div>
          </div>
        </aside>

        <div className="content">
          <section className="card" id="loginSection">
            <h2>Login Arteco Global</h2>
            <div className="grid">
              <div className="field">
                <label htmlFor="username">Email</label>
                <input id="username" type="text" placeholder="name@example.com" />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" placeholder="••••••" />
              </div>
            </div>
            <div className="grid">
              <button id="loginBtn" className="primary" disabled>
                Login Arteco Global
              </button>
            </div>
            <div id="loginSpinner" className="login-spinner hidden">
              <div className="spinner" aria-hidden="true"></div>
              <div>Login in corso...</div>
            </div>
            <div className="status" id="loginStatus"></div>
            <div className="hint">
              Dopo il login vedrai i siti a sinistra. Selezionane uno per autenticarti sul server.
            </div>
            <input id="baseUrl" type="hidden" defaultValue="" />
          </section>

          <section className="card hidden" id="exportSection">
        <h2>Export</h2>
        <p>
          Scarica l'export da <span className="mono">/api/v2/export</span> e salvalo dove vuoi.
        </p>
        <button id="exportBtn" className="primary" disabled>
          Scarica export
        </button>
        <div className="status" id="exportStatus"></div>
          </section>

          <section className="card hidden" id="backupsSection">
        <h2>Backups</h2>
        <p>
          Elenco dei backup presenti su <span className="mono">/api/v2/backups</span>.
        </p>
        <div className="backups-actions">
          <button id="refreshBackupsBtn" className="primary" disabled>
            Ricarica lista
          </button>
        </div>
        <details id="backupsAccordion" className="backups-accordion">
          <summary>
            Backup disponibili
            <span id="backupsSummaryCount" className="backups-count">
              0
            </span>
          </summary>
          <div id="backupsList" className="backups-list">
            <div className="placeholder">Login per vedere i backup disponibili.</div>
          </div>
        </details>
        <div className="status" id="backupsStatus"></div>
          </section>

          <section className="card hidden" id="importSection">
        <h2>Import</h2>
        <p>
          Carica il <span className="mono">config.json</span> con chiavi <span className="mono">CHANNELS</span> e{" "}
          <span className="mono">MAPPING</span>. Puoi attivare o disattivare <span className="mono">SNAPSHOTS</span>,{" "}
          <span className="mono">RECORDINGS</span>, <span className="mono">EVENTS</span> e le altre sezioni disponibili.
        </p>
        <div className="field">
          <label htmlFor="configFile">config.json (vecchio server)</label>
          <input id="configFile" type="file" accept="application/json" />
        </div>

        <div id="importLoading" className="import-loading hidden">
          <div className="spinner" aria-hidden="true"></div>
          <div>Caricamento mapping...</div>
        </div>

        <div id="importBody">
          <div className="associations">
            <h3>Associazioni servizi</h3>
            <h5>Servizio Precedente -&gt; Nuovo servizio</h5>
            <div className="import-keys">
              <h4>Chiavi da importare</h4>
              <div id="importKeyList" className="import-key-list">
                <div className="placeholder">Carica un config.json per selezionare le chiavi.</div>
              </div>
            </div>
            <div id="associationList" className="association-list">
              <div className="placeholder">Carica entrambi i mapping per vedere le associazioni.</div>
            </div>
          </div>

          <button id="importBtn" className="primary" disabled>
            Invia import
          </button>
          <div className="status" id="importStatus"></div>
        </div>
          </section>

          <section className="card hidden" id="resetSection">
        <h2>Reset server</h2>
        <p>
          <strong>ATTENZIONE:</strong> il reset cancella definitivamente TUTTE le REC presenti sul server.
        </p>
        <button id="resetBtn" className="primary">
          Reset server
        </button>
        <div className="status" id="resetStatus"></div>
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
