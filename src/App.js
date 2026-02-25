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
        <p>GUI minimale per scaricare l'export o aggiornare un config.json.</p>
      </header>

      <section className="card" id="loginSection">
        <h2>Base URL</h2>
        <div className="field">
          <label htmlFor="baseUrl">Base URL</label>
          <input
            id="baseUrl"
            type="text"
            placeholder="https://VXXXX.lan.omniaweb.cloud"
            defaultValue="https://VXXXX.lan.omniaweb.cloud"
          />
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" type="text" placeholder="admin" defaultValue="admin" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" placeholder="••••••" defaultValue="admin" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="authServiceSelect">Auth service</label>
          <select id="authServiceSelect" disabled>
            <option value="">Carica gli auth service</option>
          </select>
        </div>
        <div className="grid">
          <button id="loginBtn" className="primary" disabled>
            Login
          </button>
        </div>
        <div id="loginSpinner" className="login-spinner hidden">
          <div className="spinner" aria-hidden="true"></div>
          <div>Login in corso...</div>
        </div>
        <div className="status" id="loginStatus"></div>
        <div className="hint" id="baseUrlHint">
          Login obbligatorio: il token ottenuto viene usato per reset, mapping, import ed export.
        </div>
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
    </main>
  );
}

export default App;
