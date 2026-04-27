require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const monitor = require('./monitor');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API: Status do bot ────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json(monitor.getState());
});

// ─── API: Histórico de atualizações + estado ──────────────────────────────────
app.get('/api/updates', (req, res) => {
  const updates = monitor.getUpdates();
  const state   = monitor.getState();
  res.json({ ...state, ...updates });
});

// ─── API: Dispara varredura manual ────────────────────────────────────────────
app.post('/api/scan', (req, res) => {
  if (monitor.isRunning()) {
    return res.json({ success: false, message: 'Varredura já em andamento. Aguarde.' });
  }
  monitor.startScan().catch(console.error);
  res.json({ success: true, message: 'Varredura iniciada com sucesso!' });
});

// ─── Download da planilha atualizada ─────────────────────────────────────────
app.get('/download', (req, res) => {
  const csvPath = path.join(__dirname, 'output', 'planilha-atualizada.csv');
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({
      error: 'Planilha ainda não disponível. Aguarde a conclusão do primeiro ciclo de varredura.'
    });
  }
  const mtime = fs.statSync(csvPath).mtime;
  
  // Pega a data e hora (ex: 27/04/2026 14:30:00) e transforma em "27-04-2026_14h30m"
  const mtimeSP = new Date(mtime.getTime() - (3 * 60 * 60 * 1000)); // Fuso do Brasil (-3h)
  const d   = String(mtimeSP.getUTCDate()).padStart(2, '0');
  const mo  = String(mtimeSP.getUTCMonth() + 1).padStart(2, '0');
  const y   = mtimeSP.getUTCFullYear();
  const h   = String(mtimeSP.getUTCHours()).padStart(2, '0');
  const min = String(mtimeSP.getUTCMinutes()).padStart(2, '0');
  
  const nomePlanilha = `planilha-sagames_${d}-${mo}-${y}_${h}h${min}.csv`;
  res.download(csvPath, nomePlanilha);
});

// ─── Iniciar ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(60));
  console.log(`🌐  Dashboard:  http://localhost:${PORT}`);
  console.log(`📡  API Status: http://localhost:${PORT}/api/status`);
  console.log(`⬇️   Download:   http://localhost:${PORT}/download`);
  console.log('═'.repeat(60) + '\n');
});

// Inicia o cron e o primeiro ciclo
monitor.startCron();
monitor.startScan().catch(console.error);
