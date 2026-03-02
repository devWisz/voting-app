/**
 * program-viewer.js
 * ─────────────────────────────────────────────────────────────────
 * Renders the "Program" tab on first open:
 *   • Program overview + account layout diagram
 *   • Syntax-highlighted Rust source (lib.rs / Cargo.toml / Anchor.toml)
 *   • IDL JSON viewer
 *   • Step-by-step deploy guide with copyable commands
 *
 * No Solana calls — purely static rendering.
 * ─────────────────────────────────────────────────────────────────
 */

/* ── RUST SYNTAX HIGHLIGHTER ─────────────────────────────────── */
// Single-pass tokeniser using sequential regex replacements.
// Each token type gets a short CSS class (defined in styles.css).
function hlRust(code) {
  // Escape HTML first so tags don't break the output
  let o = code
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Process in order: comments, strings, then individual token types
  const rules = [
    [/(\/\/[^\n]*)/g,              `<span class="c">$1</span>`],
    [/("(?:[^"\\]|\\.)*")/g,       `<span class="s">$1</span>`],
    [/(#!?\[[^\]]*\])/g,           `<span class="a">$1</span>`],
    [/\b(declare_id|require|msg|error_code|derive|account|program)!/g,
                                   `<span class="m">$&</span>`],
    [/('[a-z_]+\b)/g,              `<span class="l">$1</span>`],
    [/\b(\d+)\b/g,                 `<span class="n">$1</span>`],
    [/\b(pub|fn|let|mut|use|mod|struct|enum|impl|for|if|else|match|return|Ok|Err|self|super|crate|type|const|static|where|true|false|in|loop|break|continue|async|await|move|ref)\b/g,
                                   `<span class="k">$1</span>`],
    [/\b(String|bool|u8|u16|u32|u64|u128|i8|i16|i32|i64|i128|f32|f64|usize|isize|Pubkey|Result|Option|Vec|Account|Signer|Program|System|Context)\b/g,
                                   `<span class="t">$1</span>`],
    [/\b([A-Z][A-Za-z0-9_]*)\b/g,  `<span class="t">$1</span>`],
    [/\b(fn\s+)([a-z_][a-z0-9_]*)/g,
                                   `<span class="k">$1</span><span class="a">$2</span>`],
  ];

  rules.forEach(([re, tpl]) => { o = o.replace(re, tpl); });
  return o;
}

/* ── JSON SYNTAX HIGHLIGHTER ─────────────────────────────────── */
function hlJson(obj) {
  const raw = JSON.stringify(obj, null, 2);
  return raw
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/("[\w ]+")(\s*:)/g,    `<span class="jk">$1</span><span class="jp">$2</span>`)
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, `: <span class="jv">$1</span>`)
    .replace(/:\s*(\d+)/g,           `: <span class="jn">$1</span>`)
    .replace(/:\s*(true|false)/g,    `: <span class="jb">$1</span>`)
    .replace(/([{}\[\],])/g,         `<span class="jp">$1</span>`);
}

/* ── WRAP WITH LINE NUMBERS ──────────────────────────────────── */
function withLineNums(html) {
  const lines = html.split('\n');
  const nums  = lines.map((_, i) => i + 1).join('\n');
  return `<div class="code-lined">
    <div class="line-nums">${nums}</div>
    <pre class="code-pre">${html}</pre>
  </div>`;
}

/* ── COPY BUTTON ─────────────────────────────────────────────── */
function makeCopyBtn(getText) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = '⎘ Copy';
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      btn.textContent = '✓ Copied';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = '⎘ Copy'; btn.classList.remove('ok'); }, 2000);
    } catch { btn.textContent = 'Failed'; }
  });
  return btn;
}

/* ── SUB-TAB SWITCH ──────────────────────────────────────────── */
function hookSubTabs(root) {
  root.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.sub-tab').forEach(b  => b.classList.remove('active'));
      root.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector('#' + btn.dataset.target)?.classList.add('active');
    });
  });
}

/* ── FILE-LEVEL CODE TABS ────────────────────────────────────── */
function hookFileTabs(winEl) {
  winEl.querySelectorAll('.ftab').forEach(btn => {
    btn.addEventListener('click', () => {
      winEl.querySelectorAll('.ftab').forEach(b  => b.classList.remove('active'));
      winEl.querySelectorAll('.fpane').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      winEl.querySelector('[data-id="' + btn.dataset.pane + '"]').style.display = 'block';
    });
  });
}

/* ── PAGE-LEVEL TAB SWITCH ───────────────────────────────────── */
function initPageTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.panel);
      if (panel) panel.classList.add('active');

      // Lazy-render Program tab on first click
      if (btn.dataset.panel === 'panel-program') {
        const content = document.getElementById('program-content');
        if (!content.dataset.rendered) {
          renderProgramTab(content);
          content.dataset.rendered = '1';
        }
      }
    });
  });
}

/* ── MAIN RENDER ─────────────────────────────────────────────── */
function renderProgramTab(container) {
  // Pre-render highlighted code strings
  const hl = {
    lib:    withLineNums(hlRust(RUST_LIB)),
    cargo:  withLineNums(hlRust(CARGO_PKG)),
    ws:     withLineNums(hlRust(CARGO_WS)),
    anchor: withLineNums(hlRust(ANCHOR_TOML)),
    idl:    withLineNums(hlJson(IDL)),
  };

  container.innerHTML = `

<!-- ══ OVERVIEW ══════════════════════════════════════════════ -->
<div class="sec-label">Program Overview</div>

<div class="info-grid">
  <div class="info-cell">
    <div class="info-label">Program ID</div>
    <div class="info-val">
      <a href="${explorerAddr(CFG.PROGRAM_ID)}" target="_blank" rel="noopener">
        ${CFG.PROGRAM_ID}
      </a>
    </div>
  </div>
  <div class="info-cell">
    <div class="info-label">Stack</div>
    <div class="info-val">
      <span class="pill pill-rust">🦀 Rust 1.70+</span>
      <span class="pill pill-anchor">⚓ Anchor 0.29</span>
      <span class="pill pill-solana">◎ Solana Devnet</span>
    </div>
  </div>
  <div class="info-cell">
    <div class="info-label">Instructions</div>
    <div class="info-val">3 — register_candidate · register_voter · cast_vote</div>
  </div>
  <div class="info-cell">
    <div class="info-label">Account Types</div>
    <div class="info-val">2 — Candidate (89 bytes) · Voter (65 bytes)</div>
  </div>
</div>

<!-- ══ ACCOUNT LAYOUT ════════════════════════════════════════ -->
<div class="sec-label" style="margin-top:28px">Account Layout & PDA Seeds</div>

<div class="accounts-diagram">
  <div class="acc-box">
    <h4>🗂 Candidate</h4>
    <ul>
      <li>c_id : Pubkey (32)</li>
      <li>party_name : String ≤20</li>
      <li>c_name : String ≤20</li>
      <li>votes : u8</li>
    </ul>
    <div class="seed-note">Seeds: [c_name, payer_pubkey]</div>
  </div>
  <div class="acc-arrow">⇄</div>
  <div class="acc-box">
    <h4>🪪 Voter</h4>
    <ul>
      <li>v_id : Pubkey (32)</li>
      <li>v_name : String ≤20</li>
      <li>is_voted : bool</li>
    </ul>
    <div class="seed-note">Seeds: [v_name, payer_pubkey]</div>
  </div>
</div>

<!-- ══ ERROR CODES ════════════════════════════════════════════ -->
<div class="sec-label" style="margin-top:28px">Custom Error Codes</div>
<div class="card" style="padding:0;overflow:hidden;margin-bottom:32px">
  <table class="err-table">
    <thead>
      <tr><th>Code</th><th>Name</th><th>Message</th><th>Triggered When</th></tr>
    </thead>
    <tbody>
      <tr>
        <td class="err-code">6000</td>
        <td class="err-name">AlreadyVoted</td>
        <td>This voter has already cast their vote</td>
        <td>voter.is_voted == true</td>
      </tr>
      <tr>
        <td class="err-code">6001</td>
        <td class="err-name">NotTheOwner</td>
        <td>Signer is not the owner of this voter account</td>
        <td>voter.v_id ≠ signer</td>
      </tr>
      <tr>
        <td class="err-code">6002</td>
        <td class="err-name">NameTooLong</td>
        <td>Name exceeds maximum length of 20 characters</td>
        <td>name.len() &gt; 20</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ══ SUB-TABS ══════════════════════════════════════════════ -->
<div id="prog-sub-tabs">
  <div class="sub-tabs">
    <button class="sub-tab active" data-target="sub-src">Source Code</button>
    <button class="sub-tab"        data-target="sub-idl">IDL</button>
    <button class="sub-tab"        data-target="sub-deploy">Deploy Guide</button>
  </div>

  <!-- ── SOURCE CODE ────────────────────────────────────────── -->
  <div class="sub-panel active" id="sub-src">
    <div class="code-win" id="src-win">
      <div class="code-bar">
        <div class="win-dots"><div class="wd r"></div><div class="wd y"></div><div class="wd g"></div></div>
        <div class="code-fname">programs/vote_app/src/</div>
        <button class="copy-btn" id="copy-rust">⎘ Copy</button>
      </div>
      <div class="file-tabs">
        <button class="ftab active" data-pane="lib">lib.rs</button>
        <button class="ftab"        data-pane="cargo">Cargo.toml (program)</button>
        <button class="ftab"        data-pane="ws">Cargo.toml (workspace)</button>
        <button class="ftab"        data-pane="anchor">Anchor.toml</button>
      </div>
      <div class="code-body">
        <div class="fpane" data-id="lib">${hl.lib}</div>
        <div class="fpane" data-id="cargo" style="display:none">${hl.cargo}</div>
        <div class="fpane" data-id="ws"    style="display:none">${hl.ws}</div>
        <div class="fpane" data-id="anchor" style="display:none">${hl.anchor}</div>
      </div>
    </div>
  </div>

  <!-- ── IDL ────────────────────────────────────────────────── -->
  <div class="sub-panel" id="sub-idl">
    <div class="code-win idl-win" id="idl-win">
      <div class="code-bar">
        <div class="win-dots"><div class="wd r"></div><div class="wd y"></div><div class="wd g"></div></div>
        <div class="code-fname">target/idl/vote_app.json</div>
        <button class="copy-btn" id="copy-idl">⎘ Copy</button>
      </div>
      <div class="code-body">${hl.idl}</div>
    </div>
  </div>

  <!-- ── DEPLOY GUIDE ───────────────────────────────────────── -->
  <div class="sub-panel" id="sub-deploy">

    <div class="card" style="margin-bottom:20px">
      <div class="card-head"><h2 class="card-title">Project Structure</h2></div>
      <div class="file-tree">
<span class="ft-dir">vote-app/</span>
├── <span class="ft-dir">programs/vote_app/src/</span>
│   └── lib.rs           <span class="ft-note">← your Anchor program</span>
├── <span class="ft-dir">programs/vote_app/</span>
│   └── Cargo.toml       <span class="ft-note">← program dependencies</span>
├── <span class="ft-dir">tests/</span>
│   └── vote_app.ts      <span class="ft-note">← TypeScript integration tests</span>
├── <span class="ft-dir">frontend/</span>
│   ├── index.html       <span class="ft-note">← this file</span>
│   ├── css/styles.css
│   └── js/ …
├── Cargo.toml           <span class="ft-note">← workspace manifest</span>
└── Anchor.toml          <span class="ft-note">← cluster + wallet config</span>
      </div>
    </div>

    <div class="deploy-list" id="deploy-steps">

      <div class="d-step">
        <div class="step-n">1</div>
        <div class="step-content">
          <h3>Install Rust, Solana CLI & Anchor</h3>
          <p>Skip any tools you already have installed.</p>
          <div class="cmd-block">
            <code>curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.29.0 && avm use 0.29.0</code>
          </div>
        </div>
      </div>
      <div class="step-sep"></div>

      <div class="d-step">
        <div class="step-n">2</div>
        <div class="step-content">
          <h3>Scaffold the Anchor Project</h3>
          <p>Create the workspace then paste <code>lib.rs</code> into the programs folder.</p>
          <div class="cmd-block">
            <code>anchor init vote-app --javascript
cd vote-app
# paste lib.rs → programs/vote_app/src/lib.rs</code>
          </div>
        </div>
      </div>
      <div class="step-sep"></div>

      <div class="d-step">
        <div class="step-n">3</div>
        <div class="step-content">
          <h3>Configure Devnet & Fund Wallet</h3>
          <p>Set CLI to devnet and airdrop SOL for deployment fees.</p>
          <div class="cmd-block">
            <code>solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 4</code>
          </div>
        </div>
      </div>
      <div class="step-sep"></div>

      <div class="d-step">
        <div class="step-n">4</div>
        <div class="step-content">
          <h3>Build the Program</h3>
          <p>Compiles to BPF bytecode and generates the IDL + a program keypair.</p>
          <div class="cmd-block">
            <code>anchor build</code>
          </div>
        </div>
      </div>
      <div class="step-sep"></div>

      <div class="d-step">
        <div class="step-n">5</div>
        <div class="step-content">
          <h3>Sync Program ID</h3>
          <p>Copy the generated address into <code>declare_id!</code> and <code>Anchor.toml</code>, then rebuild.</p>
          <div class="cmd-block">
            <code>anchor keys list
# copy printed address, then edit lib.rs + Anchor.toml
anchor build   # rebuild with updated ID</code>
          </div>
        </div>
      </div>
      <div class="step-sep"></div>

      <div class="d-step">
        <div class="step-n">6</div>
        <div class="step-content">
          <h3>Run Tests</h3>
          <p>Run the included TypeScript integration tests against localnet.</p>
          <div class="cmd-block">
            <code>anchor test</code>
          </div>
        </div>
      </div>
      <div class="step-sep"></div>

      <div class="d-step">
        <div class="step-n">7</div>
        <div class="step-content">
          <h3>Deploy to Devnet</h3>
          <p>Pushes the compiled <code>.so</code> on-chain. Costs ~2–3 SOL on devnet.</p>
          <div class="cmd-block">
            <code>anchor deploy --provider.cluster devnet</code>
          </div>
        </div>
      </div>
      <div class="step-sep"></div>

      <div class="d-step">
        <div class="step-n">8</div>
        <div class="step-content">
          <h3>Update Frontend & Open</h3>
          <p>Paste your deployed program ID into <code>js/config.js</code>, then serve the frontend folder.</p>
          <div class="cmd-block">
            <code># js/config.js → PROGRAM_ID: 'YOUR_NEW_ADDRESS'
npx serve frontend/   # or: python3 -m http.server 3000</code>
          </div>
        </div>
      </div>

    </div><!-- /deploy-list -->
  </div><!-- /sub-deploy -->

</div><!-- /prog-sub-tabs -->
`;

  // ── Wire sub-tabs ─────────────────────────────────────────
  hookSubTabs(document.getElementById('prog-sub-tabs'));

  // ── Wire file tabs inside source window ───────────────────
  const srcWin = document.getElementById('src-win');
  if (srcWin) hookFileTabs(srcWin);

  // ── Copy buttons ──────────────────────────────────────────
  const copyRust = document.getElementById('copy-rust');
  const copyIdl  = document.getElementById('copy-idl');

  if (copyRust) {
    // Which file is active? Read current visible pane
    copyRust.replaceWith(makeCopyBtn(() => {
      const active = srcWin?.querySelector('.ftab.active')?.dataset?.pane ?? 'lib';
      return active === 'lib'    ? RUST_LIB
           : active === 'cargo'  ? CARGO_PKG
           : active === 'ws'     ? CARGO_WS
                                 : ANCHOR_TOML;
    }));
  }
  if (copyIdl) {
    copyIdl.replaceWith(makeCopyBtn(() => JSON.stringify(IDL, null, 2)));
  }

  // ── Deploy step copy buttons ─────────────────────────────
  document.querySelectorAll('#deploy-steps .cmd-block').forEach(block => {
    const code = block.querySelector('code');
    const btn  = makeCopyBtn(() => code?.textContent ?? '');
    block.appendChild(btn);
  });
}

/* ── BOOT ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', initPageTabs);