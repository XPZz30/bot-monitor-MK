// Script para rodar o bot uma vez e sair — usado pelo GitHub Actions
require('dotenv').config();
const monitor = require('../monitor');

console.log('🤖 SA Games Monitor — Execução única (GitHub Actions)\n');

monitor.startScan()
  .then(result => {
    if (result.success) {
      console.log('\n✅ Concluído com sucesso!');
      process.exit(0);
    } else {
      console.error('\n❌ Falha:', result.error || result.reason);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n❌ Erro fatal:', err.message);
    process.exit(1);
  });
